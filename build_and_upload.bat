@echo off
setlocal enableextensions

:: ============================================================================
:: CONFIGURACOES
:: ============================================================================
if not defined PIO_PATH set "PIO_PATH=%USERPROFILE%\.platformio\penv\Scripts\platformio.exe"
pushd "%~dp0"
if errorlevel 1 exit /b 1
set "PROJECT_DIR=%CD%\"

:MENU
cls
echo ==============================================================================
echo           TEKSEA - SISTEMA AUTOMATIZADO DE BUILD E UPLOAD
echo ==============================================================================
echo.
echo Selecione a operacao desejada:
echo.
echo   [1] COMPLETO (Build Web + Firmware + Filesystem)
echo   [2] APENAS WEB (Build Web + Filesystem)
echo   [3] APENAS FIRMWARE (C++)
echo   [4] APENAS FILESYSTEM (Sem build, apenas upload)
echo   [5] APAGAR FLASH COMPLETA (Erase total + NVS/Wi-Fi)
echo   [6] APAGAR FLASH + GRAVAR TUDO (Erase + Web + Firmware + Filesystem)
echo   [7] Sair
echo.
echo ------------------------------------------------------------------------------
set /p opt=Opcao: 

if "%opt%"=="1" goto ALL
if "%opt%"=="2" goto WEB_ONLY
if "%opt%"=="3" goto FW_ONLY
if "%opt%"=="4" goto FS_ONLY
if "%opt%"=="5" goto ERASE_ONLY
if "%opt%"=="6" goto ERASE_AND_ALL
if "%opt%"=="7" goto QUIT
goto MENU

:ALL
call :BUILD_WEB
if errorlevel 1 goto END
call :COPY_DATA
if errorlevel 1 goto END
call :UPLOAD_FW
if errorlevel 1 goto END
call :UPLOAD_FS
goto END

:WEB_ONLY
call :BUILD_WEB
if errorlevel 1 goto END
call :COPY_DATA
if errorlevel 1 goto END
call :UPLOAD_FS
goto END

:FW_ONLY
call :UPLOAD_FW
goto END

:FS_ONLY
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%prepare_web_data.ps1" -ProjectRoot "%PROJECT_DIR%." -UseExistingData
if errorlevel 1 goto END
call :UPLOAD_FS
goto END

:ERASE_ONLY
call :ERASE_FLASH
goto END

:ERASE_AND_ALL
call :BUILD_WEB
if errorlevel 1 goto END
call :COPY_DATA
if errorlevel 1 goto END
call :ERASE_FLASH
if errorlevel 1 goto END
call :UPLOAD_FW
if errorlevel 1 goto END
call :UPLOAD_FS
goto END

:: ============================================================================
:: SUBROTINAS (Acoes isoladas)
:: ============================================================================

:ERASE_FLASH
echo.
echo === [PASSO] Apagando TODA a memoria Flash do ESP32 (incluindo NVS / Wi-Fi)...
call :RUN_PIO run -t erase
if errorlevel 1 (
    echo [ERRO] Falha ao apagar a memoria Flash.
    exit /b 1
)
exit /b 0

:BUILD_WEB
echo.
echo === [PASSO] Compilando interface React (Vite)...
cd /d "%PROJECT_DIR%WEB"
if errorlevel 1 exit /b 1
if not exist "node_modules\@types\jsdom" (
    echo === [PASSO] Instalando dependencias da interface Web...
    call npm install
    if errorlevel 1 (
        echo [ERRO] Falha ao instalar dependencias do Node.
        cd /d "%PROJECT_DIR%"
        exit /b 1
    )
)
call npm run lint
if errorlevel 1 (
    echo [ERRO] Falha na verificacao de tipos do React.
    cd /d "%PROJECT_DIR%"
    exit /b 1
)
call npm run build
if errorlevel 1 (
    echo [ERRO] Falha no build do React.
    cd /d "%PROJECT_DIR%"
    exit /b 1
)
cd /d "%PROJECT_DIR%"
exit /b 0

:COPY_DATA
echo.
echo === [PASSO] Sincronizando pasta 'data'...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%prepare_web_data.ps1" -ProjectRoot "%PROJECT_DIR%."
exit /b %errorlevel%

:UPLOAD_FW
echo.
echo === [PASSO] Gravando FIRMWARE (ESP32)...
call :RUN_PIO run -t upload
if errorlevel 1 (
    echo [ERRO] Falha no upload do firmware.
    exit /b 1
)
exit /b 0

:UPLOAD_FS
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%prepare_web_data.ps1" -ProjectRoot "%PROJECT_DIR%." -UseExistingData
if errorlevel 1 exit /b 1
echo.
echo === [PASSO] Gravando FILESYSTEM (SPIFFS)...
call :RUN_PIO run -t uploadfs
if errorlevel 1 (
    echo [ERRO] Falha no upload de arquivos.
    exit /b 1
)
exit /b 0

:RUN_PIO
cd /d "%PROJECT_DIR%"
if errorlevel 1 exit /b 1
"%PIO_PATH%" --version >nul 2>nul
if not errorlevel 1 (
    "%PIO_PATH%" %*
    exit /b
)
:: Compatibilidade com ambiente movido de computador: usa o Python disponivel
:: e os pacotes do PlatformIO existente, sem alterar configuracao global.
set "PYTHONPATH=%USERPROFILE%\.platformio\penv\Lib\site-packages;%PYTHONPATH%"
python -m platformio %*
exit /b %errorlevel%

:QUIT
popd
exit /b 0

:END
cd /d "%PROJECT_DIR%"
echo.
echo ==============================================================================
echo           OPERACAO FINALIZADA
echo ==============================================================================
echo.
pause
goto MENU
