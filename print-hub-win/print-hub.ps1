//print-hub-win/print-hub.ps1

param([int]$Port = 3333)

$ErrorActionPreference = 'Stop'

# ---- PRINTER ENUMERATION (Get-Printer or WMI fallback) --------------------
function Get-InstalledPrinters {
  if (Get-Command -Name Get-Printer -ErrorAction SilentlyContinue) {
    return (Get-Printer | Select-Object -ExpandProperty Name)
  }

  $printers = Get-WmiObject -Class Win32_Printer -ErrorAction SilentlyContinue
  if ($printers) {
    return ($printers | Select-Object -ExpandProperty Name)
  }

  return @()
}

# ---- RAW SPOOL HELPER ------------------------------------------------------
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

# ---- HTTP LISTENER WITH URLACL AUTO-FIX -----------------------------------
function New-HubListener {
  param([int]$Port)

  $prefix = "http://127.0.0.1:$Port/"
  # Use New-Object instead of ::new() so it works on older PowerShell
  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Clear()
  $listener.Prefixes.Add($prefix)

  try {
    $listener.Start()
    return $listener, $prefix
  } catch {
    if ($_.Exception.Message -match 'Access is denied') {
      Write-Host "CafeQR: URL ACL missing for $prefix, attempting to add with netsh..." -ForegroundColor Yellow

      $user = "$env:USERDOMAIN\$env:USERNAME"
      if (-not $env:USERDOMAIN -or $env:USERDOMAIN -eq $env:COMPUTERNAME) {
        $user = $env:USERNAME
      }

      $netshArgs = "http add urlacl url=$prefix user=""$user"" listen=yes"

      & netsh.exe $netshArgs | Out-Null

      # Recreate listener using New-Object again
      $listener = New-Object System.Net.HttpListener
      $listener.Prefixes.Clear()
      $listener.Prefixes.Add($prefix)
      $listener.Start()
      return $listener, $prefix
    }

    throw
  }
}

function Set-Cors([System.Net.HttpListenerResponse]$resp) {
  if (-not $resp) { return }
  $resp.Headers["Access-Control-Allow-Origin"]  = "*"
  $resp.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
  $resp.Headers["Access-Control-Allow-Headers"] = "Content-Type"
}

function Send-Json($ctx, [int]$status, $obj) {
  if (-not $ctx) { return }
  $resp = $ctx.Response
  Set-Cors $resp
  $json  = $obj | ConvertTo-Json -Depth 5
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $resp.StatusCode   = $status
  $resp.ContentType  = "application/json; charset=utf-8"
  $resp.OutputStream.Write($bytes, 0, $bytes.Length)
  $resp.OutputStream.Close()
}

# ---- MAIN ------------------------------------------------------------------
try {
  $listener, $prefix = New-HubListener -Port $Port
} catch {
  Write-Host "CafeQR Print Hub failed to start: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Run this script as Administrator and ensure netsh is allowed." -ForegroundColor Red
  exit 1
}

Write-Host "CafeQR Print Hub on $prefix"
Write-Host "Open $($prefix)health or $($prefix)printers in a browser to test."

try {
  while ($true) {
    $ctx = $listener.GetContext()
    if (-not $ctx) { continue }

    try {
      $req  = $ctx.Request
      $resp = $ctx.Response
      $method = $req.HttpMethod
      $path   = $req.RawUrl

      if ($method -eq 'OPTIONS') {
        Set-Cors $resp
        $resp.StatusCode = 204
        $resp.OutputStream.Close()
        continue
      }

      if ($method -eq 'GET' -and $path -like '/health*') {
        Send-Json $ctx 200 @{ ok = $true; host = $env:COMPUTERNAME; os = [Environment]::OSVersion.VersionString }
        continue
      }

      if ($method -eq 'GET' -and $path -like '/printers*') {
        $names = Get-InstalledPrinters
        Send-Json $ctx 200 $names
        continue
      }

      if ($method -eq 'POST' -and $path -like '/printRaw*') {
        $sr   = New-Object IO.StreamReader $req.InputStream, [Text.Encoding]::UTF8
        $raw  = $sr.ReadToEnd()
        $body = $raw | ConvertFrom-Json

        if (-not $body.printerName -or -not $body.dataBase64) {
          Send-Json $ctx 400 @{ error = 'printerName and dataBase64 required' }
          continue
        }

        $bytes = [Convert]::FromBase64String($body.dataBase64)
        $ok    = [RawPrinterHelper]::SendBytes($body.printerName, $bytes)

        if (-not $ok) {
          Send-Json $ctx 500 @{ error = 'Raw print failed (check printer name / driver)' }
        } else {
          Send-Json $ctx 200 @{ ok = $true }
        }
        continue
      }

      Send-Json $ctx 404 @{ error = 'not found' }
    } catch {
      try {
        Send-Json $ctx 500 @{ error = $_.Exception.Message }
      } catch { }
    }
  }
} finally {
  if ($listener -and $listener.IsListening) {
    $listener.Stop()
    $listener.Close()
  }
}
