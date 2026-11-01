@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0.."

set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
)

if "%~1"=="" (
  echo 未收到文件，正在打开图形界面...
  "%NODE_EXE%" "%~dp0..\src\cli.mjs"
) else (
  "%NODE_EXE%" "%~dp0..\src\cli.mjs" %* --open
)

if errorlevel 1 (
  echo.
  echo 转换过程中出现问题，请查看上面的提示。
  pause
)
endlocal
