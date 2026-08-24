@echo off
setlocal
set "ATLAS_NODE="

where node.exe >nul 2>nul
if not errorlevel 1 set "ATLAS_NODE=node.exe"

if not defined ATLAS_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "ATLAS_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined ATLAS_NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "ATLAS_NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined ATLAS_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "ATLAS_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not defined ATLAS_NODE (
  echo.
  echo ATLAS review could not start because a required component is missing.
  echo Please ask Codex or a developer to repair the review setup.
  echo.
  pause
  exit /b 1
)

if /i "%~1"=="stop" (
  "%ATLAS_NODE%" "%~dp0review-server.mjs" --stop
) else (
  "%ATLAS_NODE%" "%~dp0review-server.mjs"
)

if errorlevel 1 (
  echo.
  echo ATLAS review did not complete normally.
  echo Please ask Codex or a developer for help.
  echo.
  pause
  exit /b 1
)

endlocal

