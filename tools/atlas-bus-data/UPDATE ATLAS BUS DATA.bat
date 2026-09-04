@echo off
setlocal
node "%~dp0update-atlas-bus-data.mjs"
if errorlevel 1 echo Bus data could not be updated. The previous verified dataset remains in use.
endlocal
