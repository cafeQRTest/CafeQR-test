//print-hub-win/print-hub.ps1

param([int]$Port = 3333)

# === Raw printer helper (Win32 spooler API, no external exe) ===
Add-Type -Language CSharp @'
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)]
        public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)]
        public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)]
        public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA",
        SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter",
        SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA",
        SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level,
        [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter",
        SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter",
        SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter",
        SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter",
        SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytes(string printerName, byte[] bytes)
    {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
        {
            return false;
        }

        DOCINFOA di = new DOCINFOA();
        di.pDocName = "CafeQR";
        di.pDataType = "RAW";
        di.pOutputFile = null;

        if (!StartDocPrinter(hPrinter, 1, di))
        {
            ClosePrinter(hPrinter);
            return false;
        }

        if (!StartPagePrinter(hPrinter))
        {
            EndDocPrinter(hPrinter);
            ClosePrinter(hPrinter);
            return false;
        }

        IntPtr pUnmanagedBytes = Marshal.AllocHGlobal(bytes.Length);
        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);

        int dwWritten = 0;
        bool ok = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);

        Marshal.FreeHGlobal(pUnmanagedBytes);
        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);

        return ok && dwWritten == bytes.Length;
    }
}
'@

# === Simple HTTP server (same contract as before) ===

$listener = [System.Net.HttpListener]::new()
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "CafeQR Print Hub on $prefix"

function SetCors($resp) {
  $resp.Headers["Access-Control-Allow-Origin"] = "*"
  $resp.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
  $resp.Headers["Access-Control-Allow-Headers"] = "Content-Type"
}
function Send($ctx, $status, $body, $ct="application/json") {
  SetCors $ctx.Response
  $bytes = [Text.Encoding]::UTF8.GetBytes($body)
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = $ct
  $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
  $ctx.Response.Close()
}

while ($true) {
  $ctx = $listener.GetContext()
  try {
    $method = $ctx.Request.HttpMethod
    $path = $ctx.Request.RawUrl

    if ($method -eq 'OPTIONS') {
      SetCors $ctx.Response
      $ctx.Response.StatusCode = 204
      $ctx.Response.OutputStream.Close()
      continue
    }

    if ($method -eq 'GET' -and $path -like '/health*') {
      Send $ctx 200 (ConvertTo-Json @{ ok = $true; host = $env:COMPUTERNAME })
      continue
    }

    if ($method -eq 'GET' -and $path -like '/printers*') {
      $names = (Get-Printer | Select-Object -ExpandProperty Name)
      Send $ctx 200 (ConvertTo-Json -Depth 3 $names)
      continue
    }

    if ($method -eq 'POST' -and $path -like '/printRaw*') {
      $raw = (New-Object IO.StreamReader $ctx.Request.InputStream).ReadToEnd()
      $body = $raw | ConvertFrom-Json
      if (-not $body.printerName -or -not $body.dataBase64) {
        Send $ctx 400 (ConvertTo-Json @{ error='printerName and dataBase64 required' })
        continue
      }

      $bytes = [Convert]::FromBase64String($body.dataBase64)
      $ok = [RawPrinterHelper]::SendBytes($body.printerName, $bytes)
      if (-not $ok) {
        Send $ctx 500 (ConvertTo-Json @{ error = 'Raw print failed (check printer name or driver)' })
      } else {
        Send $ctx 200 (ConvertTo-Json @{ ok = $true })
      }
      continue
    }

    Send $ctx 404 (ConvertTo-Json @{ error='not found' })
  } catch {
    Send $ctx 500 (ConvertTo-Json @{ error = $_.Exception.Message })
  }
}
