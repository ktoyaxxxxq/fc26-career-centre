$ErrorActionPreference = 'Stop'
function Reply($reply) { $reply | ConvertTo-Json -Compress -Depth 4 }
try {
  $options = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
  $process = Get-Process -Id $options.pid -ErrorAction SilentlyContinue
  if (!$process -or $process.ProcessName -notin @('FC26', 'FC26_Trial', 'FC26_Showcase')) { Reply @{ ok=$false; code='foreground' }; exit }
  Add-Type -AssemblyName System.Drawing
  Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;

public static class CareerControl {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] private struct MouseInput { public int X, Y; public uint Data, Flags, Time; public UIntPtr Extra; }
  [StructLayout(LayoutKind.Sequential)] private struct Input { public uint Type; public MouseInput Mouse; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rectangle);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] private static extern uint SendInput(uint count, Input[] inputs, int size);

  private static bool Owns(IntPtr window, int expectedPid) {
    uint pid;
    return window != IntPtr.Zero && GetWindowThreadProcessId(window, out pid) != 0 && pid == expectedPid;
  }
  public static IntPtr Foreground(int expectedPid) {
    IntPtr window = GetForegroundWindow();
    return Owns(window, expectedPid) ? window : IntPtr.Zero;
  }
  public static bool At(int x, int y, int expectedPid) {
    return Owns(WindowFromPoint(new Point { X = x, Y = y }), expectedPid);
  }
  public static string Sample(int x, int y) {
    byte[] result = new byte[1152];
    int index = 0;
    using (Bitmap image = new Bitmap(96, 48)) {
      using (Graphics desktop = Graphics.FromImage(image)) desktop.CopyFromScreen(x - 48, y - 24, 0, 0, image.Size);
      for (int row = 2; row < 48; row += 4) for (int col = 2; col < 96; col += 3) {
        Color pixel = image.GetPixel(col, row);
        result[index++] = pixel.R;
        result[index++] = pixel.G;
        result[index++] = pixel.B;
      }
    }
    return Convert.ToBase64String(result);
  }
  public static bool HasDetail(string sample) {
    byte[] bytes = Convert.FromBase64String(sample);
    int dark = 255, light = 0;
    for (int i = 0; i < bytes.Length; i += 3) {
      int luma = (bytes[i] + 2*bytes[i+1] + bytes[i+2]) / 4;
      dark = Math.Min(dark, luma);
      light = Math.Max(light, luma);
    }
    return light - dark >= 45;
  }
  public static bool Similar(string expected, string actual) {
    byte[] saved = Convert.FromBase64String(expected);
    byte[] now = Convert.FromBase64String(actual);
    int total = 0, changed = 0;
    if (saved.Length != now.Length) return false;
    for (int i = 0; i < saved.Length; i++) {
      int distance = Math.Abs(saved[i] - now[i]);
      total += distance;
      if (distance > 35) changed++;
    }
    return total <= 13 * saved.Length && changed <= saved.Length * .14;
  }
  public static bool Click(int x, int y, int pid) {
    Point cursor;
    if (Foreground(pid) == IntPtr.Zero || !At(x, y, pid) || !GetCursorPos(out cursor) || cursor.X != x || cursor.Y != y) return false;
    Input[] click = new Input[2];
    click[0].Mouse.Flags = 0x0002;
    click[1].Mouse.Flags = 0x0004;
    return SendInput(2, click, Marshal.SizeOf(typeof(Input))) == 2;
  }
}
'@
  [void][CareerControl]::SetProcessDPIAware()
  $foreground = [CareerControl]::Foreground($process.Id)
  if ($foreground -eq [IntPtr]::Zero) { Reply @{ ok=$false; code='foreground' }; exit }
  $rect = New-Object CareerControl+Rect
  $origin = New-Object CareerControl+Point
  if (!([CareerControl]::GetClientRect($foreground, [ref]$rect) -and [CareerControl]::ClientToScreen($foreground, [ref]$origin))) { Reply @{ok=$false; code='unavailable'}; exit }
  if ($options.mode -eq 'capture') {
    $cursor = New-Object CareerControl+Point
    if (![CareerControl]::GetCursorPos([ref]$cursor)) { Reply @{ ok=$false; code='position' }; exit }
    $relativeX = $cursor.X - $origin.X
    $relativeY = $cursor.Y - $origin.Y
  } else {
    $saved = $options.binding
    if ($rect.Right -ne $saved.width -or $rect.Bottom -ne $saved.height) { Reply @{ ok=$false; code='size' }; exit }
    $relativeX = [int]$saved.x
    $relativeY = [int]$saved.y
  }
  $x = $origin.X + $relativeX
  $y = $origin.Y + $relativeY
  if ($relativeX -lt 48 -or $relativeX -gt $rect.Right - 48 -or $relativeY -lt 24 -or $relativeY -gt $rect.Bottom - 24 -or ![CareerControl]::At($x, $y, $process.Id)) { Reply @{ ok=$false; code='position' }; exit }
  if ($options.mode -eq 'press') {
    [void][CareerControl]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds 180
  }
  if ([CareerControl]::Foreground($process.Id) -ne $foreground -or ![CareerControl]::At($x, $y, $process.Id)) { Reply @{ ok=$false; code='foreground' }; exit }
  $sample = [CareerControl]::Sample($x, $y)
  if ($options.mode -eq 'capture') {
    if (![CareerControl]::HasDetail($sample)) { Reply @{ ok=$false; code='detail' }; exit }
    Reply @{ ok=$true; binding=@{ x=$relativeX; y=$relativeY; width=$rect.Right; height=$rect.Bottom; sample=$sample } }
  } elseif (![CareerControl]::Similar($saved.sample, $sample)) {
    Reply @{ ok=$false; code='screen' }
  } else {
    $sent = [CareerControl]::Click($x, $y, $process.Id)
    Reply @{ ok=$sent; code='input' }
  }
} catch { Reply @{ ok=$false; code='unavailable' } }
