@echo off
setlocal enabledelayedexpansion

:: Forçar codificação UTF-8 para acentos
chcp 65001 > nul

:: ============================================================================
:: CONFIGURAÇÕES
:: ============================================================================
set PIO_PATH=C:\Users\marcel.hilleshein\.platformio\penv\Scripts\platformio.exe
set PROJECT_DIR=%~dp0

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
echo   [5] Sair
echo.
echo ------------------------------------------------------------------------------
set /p opt=Opcao: 

if "%opt%"=="1" goto ALL
if "%opt%"=="2" goto WEB_ONLY
if "%opt%"=="3" goto FW_ONLY
if "%opt%"=="4" goto FS_ONLY
if "%opt%"=="5" exit /b 0
goto MENU

:ALL
call :BUILD_WEB
if errorlevel 1 goto END
call :COPY_DATA
call :UPLOAD_FW
if errorlevel 1 goto END
call :UPLOAD_FS
goto END

:WEB_ONLY
call :BUILD_WEB
if errorlevel 1 goto END
call :COPY_DATA
call :UPLOAD_FS
goto END

:FW_ONLY
call :UPLOAD_FW
goto END

:FS_ONLY
call :COPY_DATA
call :UPLOAD_FS
goto END

:: ============================================================================
:: SUBROTINAS (Acoes isoladas)
:: ============================================================================

:BUILD_WEB
echo.
echo === [PASSO] Compilando interface React (Vite)...
cd /d "%PROJECT_DIR%WEB"
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
if exist data rd /s /q data
mkdir data
xcopy /s /y WEB\dist\* data\ > nul
echo [OK] Pasta data preparada.
exit /b 0

:UPLOAD_FW
echo.
echo === [PASSO] Gravando FIRMWARE (ESP32)...
"%PIO_PATH%" run -t upload
if errorlevel 1 (
    echo [ERRO] Falha no upload do firmware.
    exit /b 1
)
exit /b 0

:UPLOAD_FS
echo.
echo === [PASSO] Gravando FILESYSTEM (SPIFFS)...
"%PIO_PATH%" run -t uploadfs
if errorlevel 1 (
    echo [ERRO] Falha no upload de arquivos.
    exit /b 1
)
exit /b 0

:END
echo.
echo ==============================================================================
echo           OPERACAO FINALIZADA
echo ==============================================================================
echo.
pause
goto MENU
