@echo off
setlocal EnableExtensions
title ATLAS BUS Alpha.4 Final Acceptance Gate

set "ATLAS_NODE="
where node.exe >nul 2>nul
if not errorlevel 1 set "ATLAS_NODE=node.exe"
if not defined ATLAS_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "ATLAS_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined ATLAS_NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "ATLAS_NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined ATLAS_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "ATLAS_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not defined ATLAS_NODE (
  echo BLOCKED: Node.js runtime could not be located.
  exit /b 20
)
set "ATLAS_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%ATLAS_PYTHON%" (
echo BLOCKED: The previously verified ATLAS Python runtime is no longer available.
exit /b 23
)
echo Using Python:
echo %ATLAS_PYTHON%
"%ATLAS_PYTHON%" --version
if errorlevel 1 exit /b 24
if not exist "atlas\data\bus\manifest.json" (
  echo BLOCKED: The completed prepared bus dataset is missing manifest.json.
  echo Do not rebuild automatically. Return to the Technical Director.
  exit /b 21
)

echo Using Node:
echo %ATLAS_NODE%
"%ATLAS_NODE%" --version
if errorlevel 1 exit /b 22

echo.
echo [1/10] Future refresh runtime and current-manifest provenance
"%ATLAS_NODE%" tools\atlas-bus-data\run-build.mjs --check-runtime
if errorlevel 1 exit /b 30
"%ATLAS_NODE%" tools\atlas-bus-data\run-build.mjs --normalise-existing
if errorlevel 1 exit /b 31

echo.
echo [2/10] Routing adapter regression
"%ATLAS_NODE%" --check src\atlas\adapters\osrm-access-routing-adapter.mjs
if errorlevel 1 exit /b 32
"%ATLAS_NODE%" tests\atlas\osrm-access-routing-adapter.test.mjs
if errorlevel 1 exit /b 33

echo.
echo [3/10] Prepared-data adapter focused regression
"%ATLAS_NODE%" tests\atlas\prepared-bus-data-adapter.test.mjs
if errorlevel 1 exit /b 34

echo.
echo [4/10] Full deterministic and prepared-data integrity suite
"%ATLAS_NODE%" tests\atlas\run-all.mjs
if errorlevel 1 exit /b 35

echo.
echo [5/10] Crystal Palace full Bus live control
"%ATLAS_NODE%" -e "setTimeout(() => process.exit(0), 1600)"
if errorlevel 1 exit /b 36
"%ATLAS_NODE%" tests\atlas\live\tfl-crystal-palace-smoke.mjs
if errorlevel 1 exit /b 37

echo.
echo [6/10] Waltham Cross full Bus live control
"%ATLAS_NODE%" -e "setTimeout(() => process.exit(0), 1600)"
if errorlevel 1 exit /b 38
"%ATLAS_NODE%" tests\atlas\live\naptan-waltham-cross-smoke.mjs
if errorlevel 1 exit /b 39

echo.
echo [7/10] Cambridge full Bus live control
"%ATLAS_NODE%" -e "setTimeout(() => process.exit(0), 1600)"
if errorlevel 1 exit /b 40
"%ATLAS_NODE%" tests\atlas\live\cambridge-national-smoke.mjs
if errorlevel 1 exit /b 41

echo.
echo [8/10] Review-environment browser regression
"%ATLAS_NODE%" tests\atlas\review-environment-browser.mjs
if errorlevel 1 exit /b 42

echo.
echo [9/10] Planner/browser/live-CORS gates
"%ATLAS_NODE%" -e "setTimeout(() => process.exit(0), 1600)"
if errorlevel 1 exit /b 43
"%ATLAS_NODE%" tests\atlas\run-browser-gates.mjs
if errorlevel 1 exit /b 44

echo.
echo [10/10] Final legacy isolation confirmation
"%ATLAS_NODE%" tests\atlas\legacy-isolation.test.mjs
if errorlevel 1 exit /b 45

echo.
echo PASS: ATLAS BUS Alpha.4 final acceptance gate completed.
exit /b 0
