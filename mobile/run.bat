@echo off
REM CineBook device launcher: sets the USB tunnel (phone localhost:3000 -> PC),
REM then runs the app. Use this instead of "flutter run" so the tunnel is always
REM established before launch. Pass extra flags through, e.g.  run.bat --release
echo [run] Setting adb reverse tunnel tcp:3000 -> tcp:3000 ...
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" reverse tcp:3000 tcp:3000
echo [run] Launching app ...
flutter run %*
