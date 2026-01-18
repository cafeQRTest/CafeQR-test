param([int]$Port = 3333)

$ErrorActionPreference = 'Stop'

# ---- JSON COMPAT (PS2 fallback) -------------------------------------------
# ConvertTo-Json/ConvertFrom-Json were introduced in PowerShell 3.0. [web:503][web:510]
$script:HasConvertToJson   = !!(Get-Command ConvertTo-Json   -ErrorAction SilentlyContinue)
$script:HasConvertFromJson = !!(Get-Command ConvertFrom-Json -ErrorAction SilentlyContinue)

function New-JavaScriptSerializer {
  # JavaScriptSerializer is available via System.Web.Extensions. [web:508][web:499]
  try { Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue } catch { }
  $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  try { $ser.MaxJsonLength = [Int32]::MaxValue } catch { }
  return $ser
}

function To-JsonCompat($obj) {
  if ($script:HasConvertToJson) {
    return ($obj | ConvertTo-Json -Depth 5)
  }
  $ser = New-JavaScriptSerializer
  return $ser.Serialize($obj)  # PS2 fallback. [web:499][web:508]
}

function From-JsonCompat([string]$json) {
  if ($script:HasConvertFromJson) {
    return ($json | ConvertFrom-Json)
  }
  $ser = New-JavaScriptSerializer
  return $ser.DeserializeObject($json)  # PS2 fallback. [web:499][web:508]
}

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

  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Clear()
  $listener.Prefixes.Add($prefix)

  try {
    $listener.Start()
    return $listener, $prefix
  } catch {
    $msg     = $_.Exception.Message
    $account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

    if ($msg -match 'Access is denied' -or
        $msg -match 'conflicts with an existing registration' -or
        $msg -match 'failed to listen on prefix') {

      Write-Host "CafeQR: fixing URL ACL for $prefix (account $account)..." -ForegroundColor Yellow

      & netsh.exe http delete urlacl url=$prefix 2>$null | Out-Null
      & netsh.exe http add urlacl url=$prefix user="$account" listen=yes | Out-Null

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
  $json  = To-JsonCompat $obj
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
      $req    = $ctx.Request
      $resp   = $ctx.Response
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
        $body = From-JsonCompat $raw

        # body can be PSCustomObject (PS3+) or Dictionary/Hashtable (PS2 fallback)
        $printerName = $null
        $dataBase64  = $null

        if ($body -is [System.Collections.IDictionary]) {
          $printerName = $body["printerName"]
          $dataBase64  = $body["dataBase64"]
        } else {
          $printerName = $body.printerName
          $dataBase64  = $body.dataBase64
        }

        if (-not $printerName -or -not $dataBase64) {
          Send-Json $ctx 400 @{ error = 'printerName and dataBase64 required' }
          continue
        }

        $bytes = [Convert]::FromBase64String($dataBase64)
        $ok    = [RawPrinterHelper]::SendBytes($printerName, $bytes)

        if (-not $ok) {
          Send-Json $ctx 500 @{ error = 'Raw print failed (check printer name / driver)' }
        } else {
          Send-Json $ctx 200 @{ ok = $true }
        }
        continue
      }

      Send-Json $ctx 404 @{ error = 'not found' }
    } catch {
      try { Send-Json $ctx 500 @{ error = $_.Exception.Message } } catch { }
    }
  }
} finally {
  if ($listener -and $listener.IsListening) {
    $listener.Stop()
    $listener.Close()
  }
}
