@echo off
setlocal
set "SCRIPT_NAME=tms_bridge.py"
set "EXE_NAME=tms_bridge"

echo [1/3] Procurando Python com suporte a GUI...

:: Tenta Python Global
python --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "PY_EXE=python"
    goto :found
)

:: Tenta comando "py" (Windows Launcher)
py --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "PY_EXE=py"
    goto :found
)

:: Tenta PlatformIO (Backup)
set "PY_EXE=C:\Users\marcel.hilleshein\.platformio\penv\Scripts\python.exe"
if exist "%PY_EXE%" goto :found

echo ERRO: Nenhum interpretador Python encontrado!
echo Por favor, instale o Python do site python.org e marque 'Add to PATH'.
pause
exit /b 1

:found
echo Usando: %PY_EXE%

echo [2/3] Instalando/Atualizando PyInstaller...
"%PY_EXE%" -m pip install pyinstaller

echo [3/3] Compilando script para executavel...
"%PY_EXE%" -m PyInstaller --onefile --noconsole --name %EXE_NAME% %SCRIPT_NAME%

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===================================================
    echo SUCESSO! O arquivo foi gerado em: dist\%EXE_NAME%.exe
    echo ===================================================
    echo Movendo executavel para a pasta atual...
    move /y "dist\%EXE_NAME%.exe" .
    echo.
    echo Próximo passo: Execute o 'install_protocol.bat' como Administrador.
) else (
    echo.
    echo !!!!!!!!! ERRO DURANTE A COMPILACAO !!!!!!!!!
)

pause
