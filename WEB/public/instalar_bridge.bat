@echo off
setlocal enableextensions enabledelayedexpansion
title Instalador Automatico - TEKSEA Bridge (TPS / SCR)

:: ============================================================
::   instalar_bridge.bat
::   Servido pelo ESP32 - Baixa e instala o TEKSEA Bridge v2.1.0
::   Repositorio: https://github.com/bacgraf/CALIBRADOR_TPS_SCR
:: ============================================================

set "INSTALL_DIR=C:\TEKSEA_BRIDGE"
set "GH_RAW=https://raw.githubusercontent.com/bacgraf/CALIBRADOR_TPS_SCR/main/TEKSEA_BRIDGE"
set "GH_CCS_ZIP=https://github.com/bacgraf/CALIBRADOR_TPS_SCR/releases/latest/download/ccs_base.zip"
set "NET_SHARE=\\srv01\01 TEKSEA\111 PUB\01 INTRANET\Marcel Hilleshein\DEV\CALIBRADOR_TPS_SCR\TEKSEA_BRIDGE"
set "STAGE_DIR=%~1"

:: --- PASSO 0: Staging na sessao do usuario + Auto-elevacao ---
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Preparando arquivos do TEKSEA Bridge v2.1.0...
    set "STAGE_DIR=%TEMP%\teksea_bridge_stage"
    if not exist "!STAGE_DIR!\user_files\configs" mkdir "!STAGE_DIR!\user_files\configs"
    if not exist "!STAGE_DIR!\user_files\settings" mkdir "!STAGE_DIR!\user_files\settings"
    if not exist "!STAGE_DIR!\user_files\images" mkdir "!STAGE_DIR!\user_files\images"

    for %%F in (
        "teksea_bridge.py"
        "pit_parser.py"
        "flash_controller.py"
        "version.json"
        "install_TPS_SCR_calibrador.bat"
        "uninstall_TPS_SCR_calibrador.bat"
        "one_time_setup.bat"
        "kill_bridge.bat"
        "stop_bridge.py"
        "dpinst_64_eng.exe"
        "LEIAME.txt"
        "user_files/configs/tms320f28375s.ccxml"
        "user_files/settings/generated.ufsettings"
    ) do (
        set "REL=%%~F"
        set "WIN_REL=!REL:/=\!"
        curl.exe -fksSL "%GH_RAW%/!REL!" -o "!STAGE_DIR!\!WIN_REL!" >nul 2>&1
        if !errorLevel! neq 0 (
            if exist "%NET_SHARE%\!WIN_REL!" (
                copy /y "%NET_SHARE%\!WIN_REL!" "!STAGE_DIR!\!WIN_REL!" >nul 2>&1
            )
        )
    )

    :: Preserva config.json e ms_cache.bin da instalacao antiga em Documents (se existir)
    if exist "%USERPROFILE%\Documents\TEKSEA_BRIDGE\config.json" (
        copy /y "%USERPROFILE%\Documents\TEKSEA_BRIDGE\config.json" "!STAGE_DIR!\config.json" >nul 2>&1
    )
    if exist "%USERPROFILE%\Documents\TEKSEA_BRIDGE\ms_cache.bin" (
        copy /y "%USERPROFILE%\Documents\TEKSEA_BRIDGE\ms_cache.bin" "!STAGE_DIR!\ms_cache.bin" >nul 2>&1
    )

    echo Solicitando permissao de Administrador...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '\"!STAGE_DIR!\"' -Verb RunAs"
    exit /b
)

cls
echo.
echo  ================================================
echo    TEKSEA BRIDGE - INSTALADOR AUTOMATICO v2.1.0
echo    TPS125 / SCR Calibrador
echo  ================================================
echo.

:: --- PASSO 1: Verificar Python ------------------------------
echo [1/6] Verificando instalacao do Python...
python --version >nul 2>nul
if %errorLevel% neq 0 (
    echo.
    echo  ERRO: Python nao encontrado no PATH do Windows!
    echo  Instale o Python 3.11 ^(marcando "Add Python to PATH"^) em:
    echo  https://www.python.org/downloads/release/python-3119/
    goto :falha
)
for /f "tokens=2" %%v in ('python --version') do set PYVER=%%v
echo  OK - Python detectado: %PYVER%
echo.

:: --- PASSO 1.5: Encerrar instancia antiga do Bridge ---------
echo [2/6] Encerrando instancia anterior do TEKSEA Bridge ^(se ativo^)...
curl.exe -s -X POST http://127.0.0.1:8760/sys/shutdown >nul 2>&1
timeout /t 1 /nobreak >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name like 'python%'\" | Where-Object { $_.CommandLine -match 'teksea_bridge\.py' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 1 /nobreak >nul

:: --- PASSO 2: Instalar arquivos em C:\TEKSEA_BRIDGE ---------
echo [2/6] Instalando arquivos do TEKSEA Bridge v2.1.0...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\user_files\configs" mkdir "%INSTALL_DIR%\user_files\configs"
if not exist "%INSTALL_DIR%\user_files\settings" mkdir "%INSTALL_DIR%\user_files\settings"
if not exist "%INSTALL_DIR%\user_files\images" mkdir "%INSTALL_DIR%\user_files\images"

:: Garante permissao de modificacao para usuarios autenticados (necessario para auto-update)
icacls "%INSTALL_DIR%" /grant *S-1-5-11:(OI)(CI)M /T /Q >nul 2>&1

for %%F in (
    "teksea_bridge.py"
    "pit_parser.py"
    "flash_controller.py"
    "version.json"
    "install_TPS_SCR_calibrador.bat"
    "uninstall_TPS_SCR_calibrador.bat"
    "one_time_setup.bat"
    "kill_bridge.bat"
    "stop_bridge.py"
    "dpinst_64_eng.exe"
    "LEIAME.txt"
    "user_files/configs/tms320f28375s.ccxml"
    "user_files/settings/generated.ufsettings"
) do (
    set "REL=%%~F"
    set "WIN_REL=!REL:/=\!"
    if not "%STAGE_DIR%"=="" if exist "%STAGE_DIR%\!WIN_REL!" (
        copy /y "%STAGE_DIR%\!WIN_REL!" "%INSTALL_DIR%\!WIN_REL!" >nul 2>&1
    ) else (
        echo  -> Baixando !REL!...
        curl.exe -fksSL "%GH_RAW%/!REL!" -o "%INSTALL_DIR%\!WIN_REL!" >nul 2>&1
        if !errorLevel! neq 0 (
            if exist "%NET_SHARE%\!WIN_REL!" (
                copy /y "%NET_SHARE%\!WIN_REL!" "%INSTALL_DIR%\!WIN_REL!" >nul 2>&1
            ) else (
                echo  AVISO: Nao foi possivel obter !REL!.
            )
        )
    )
)

:: Restaura config.json e ms_cache.bin se capturados no staging e nao existentes no destino
if not "%STAGE_DIR%"=="" (
    if not exist "%INSTALL_DIR%\config.json" if exist "%STAGE_DIR%\config.json" (
        copy /y "%STAGE_DIR%\config.json" "%INSTALL_DIR%\config.json" >nul 2>&1
    )
    if not exist "%INSTALL_DIR%\ms_cache.bin" if exist "%STAGE_DIR%\ms_cache.bin" (
        copy /y "%STAGE_DIR%\ms_cache.bin" "%INSTALL_DIR%\ms_cache.bin" >nul 2>&1
    )
    rd /s /q "%STAGE_DIR%" >nul 2>&1
)

if not exist "%INSTALL_DIR%\teksea_bridge.py" (
    echo  ERRO: Falha ao obter teksea_bridge.py.
    echo  Verifique o acesso a rede local ^(srv01^) ou a permissao do repositorio GitHub.
    goto :falha
)

:: Verifica/baixa ccs_base (DSLite para gravacao JTAG)
if not exist "%INSTALL_DIR%\ccs_base\DebugServer\bin\DSLite.exe" (
    echo.
    echo  Verificando pacote JTAG ^(ccs_base^)...
    curl.exe -fksSL "%GH_CCS_ZIP%" -o "%temp%\ccs_base.zip" >nul 2>&1
    if !errorLevel! equ 0 (
        echo  Extraindo ccs_base.zip...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%temp%\ccs_base.zip' -DestinationPath '%INSTALL_DIR%' -Force"
        del "%temp%\ccs_base.zip" >nul 2>&1
    ) else if exist "%NET_SHARE%\ccs_base\DebugServer\bin\DSLite.exe" (
        echo  Copiando ccs_base da rede local...
        robocopy "%NET_SHARE%\ccs_base" "%INSTALL_DIR%\ccs_base" /E /NFL /NDL /NJH /NJS /NC /NS /NP >nul
    ) else (
        echo  AVISO: ccs_base nao encontrado em Releases ou na rede.
        echo         O Bridge funcionara para PIT/Nuvem/Lote, mas a gravacao JTAG requer a pasta ccs_base.
    )
)
echo  OK - Arquivos prontos em %INSTALL_DIR%.
echo.

:: --- PASSO 3: Instalar Dependencias Python ------------------
echo [3/6] Instalando dependencias Python ^(msal, requests, pymupdf, python-docx^)...
python -m pip install --quiet --upgrade msal requests pymupdf python-docx
if %errorLevel% neq 0 (
    echo  ERRO ao instalar dependencias Python via pip.
    goto :falha
)
echo  OK - Dependencias instaladas.
echo.

:: --- PASSO 4: Drivers USB FTDI / XDS ------------------------
echo [4/6] Verificando drivers USB do gravador...
if exist "%INSTALL_DIR%\dpinst_64_eng.exe" if exist "%INSTALL_DIR%\ccs_base\emulation\windows\ftdi_drivers" (
    "%INSTALL_DIR%\dpinst_64_eng.exe" /SE /SW /SA /PATH "%INSTALL_DIR%\ccs_base\emulation\windows\ftdi_drivers" >nul 2>&1
)
echo  OK - Drivers verificados.
echo.

:: --- PASSO 5: Registrar Protocolo teksea:// e Whitelist -----
echo [5/6] Registrando protocolo teksea:// e permissoes do navegador...

set "SCRIPT_PATH=%INSTALL_DIR%\teksea_bridge.py"
python -c "import sys, os; print(os.path.join(os.path.dirname(sys.executable), 'pythonw.exe'))" > "%temp%\pyw.txt"
set /p PYTHONW= < "%temp%\pyw.txt"
del "%temp%\pyw.txt" >nul 2>&1

if not exist "%PYTHONW%" (
    python -c "import sys; print(sys.executable)" > "%temp%\pyw.txt"
    set /p PYTHONW= < "%temp%\pyw.txt"
    del "%temp%\pyw.txt" >nul 2>&1
)

set "REG_CMD=\"%PYTHONW%\" \"%SCRIPT_PATH%\" \"%%1\""
reg add "HKCR\teksea" /ve /t REG_SZ /d "URL:Teksea Protocol" /f >nul
reg add "HKCR\teksea" /v "URL Protocol" /t REG_SZ /d "" /f >nul
reg add "HKCR\teksea\shell\open\command" /ve /t REG_SZ /d "%REG_CMD%" /f >nul

:: Edge e Chrome Whitelist
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge" /v "AutoLaunchProtocolsFromOrigins" /t REG_SZ /d "[{\"allowed_origins\": [\"*\"], \"protocol\": \"teksea\"}]" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge\URLAllowlist" /v "1" /t REG_SZ /d "teksea://*" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Google\Chrome" /v "AutoLaunchProtocolsFromOrigins" /t REG_SZ /d "[{\"allowed_origins\": [\"*\"], \"protocol\": \"teksea\"}]" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Google\Chrome\URLAllowlist" /v "1" /t REG_SZ /d "teksea://*" /f >nul 2>&1

echo  OK - Protocolo teksea:// registrado.
echo.

:: --- PASSO 6: Iniciar TEKSEA Bridge agora -------------------
echo [6/6] Iniciando TEKSEA Bridge v2.1.0 em segundo plano...
start "" "%PYTHONW%" "%SCRIPT_PATH%" "teksea://start"

echo.
echo  ================================================
echo   INSTALACAO CONCLUIDA COM SUCESSO!
echo   O TEKSEA Bridge v2.1.0 ja foi iniciado.
echo   Retorne ao navegador ^(BRIDGE: OK v2.1.0^).
echo  ================================================
echo.
pause
exit /b 0

:falha
echo.
pause
exit /b 1
