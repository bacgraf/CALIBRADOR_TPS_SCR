@echo off
setlocal enableextensions

:: Verifica permissao de administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando permissoes de administrador...
    powershell -Command "Start-Process '%0' -Verb RunAs"
    exit /b
)

echo ===================================================
echo   INSTALADOR EXCEL LOGGER BRIDGE
echo ===================================================
echo.

:: 1. Localiza o Python no sistema
echo.
echo [1/3] Localizando executavel do Python...
for /f "delims=" %%i in ('where python') do (
    set "py_exe=%%i"
    goto :found_py
)
:found_py

if "%py_exe%"=="" (
    echo [!] ERRO CRITICO: Python nao encontrado! Instale o Python antes de continuar.
    pause
    exit /b
)
echo Python encontrado em: %py_exe%

:: 2. Instala dependencias usando o caminho absoluto
echo.
echo [2/3] Instalando biblioteca 'openpyxl' no Python detectado...
"%py_exe%" -m pip install openpyxl
if %errorLevel% neq 0 (
    echo [!] AVISO: Erro ao tentar instalar via PIP.
)

set "logger_script=%~dp0excel_logger.py"
echo Script alvo: %logger_script%

echo.
echo [3/3] Registrando protocolo teksea-sn:// no Registro do Windows...
:: Cria o arquivo .reg temporário
set "regfile=%temp%\teksea_sn_reg.reg"
echo Windows Registry Editor Version 5.00 > "%regfile%"
echo. >> "%regfile%"
echo [HKEY_CLASSES_ROOT\teksea-sn] >> "%regfile%"
echo @="URL:Teksea SN Protocol" >> "%regfile%"
echo "URL Protocol"="" >> "%regfile%"
echo [HKEY_CLASSES_ROOT\teksea-sn\shell\open\command] >> "%regfile%"

:: Escape de caminhos para o registro
set "escaped_py=%py_exe:\=\\%"
set "escaped_script=%logger_script:\=\\%"
echo @="\"%escaped_py%\" \"%escaped_script%\" \"%%1\"" >> "%regfile%"

regedit.exe /s "%regfile%"
if %errorLevel% equ 0 (echo Comando de Registro executado com sucesso.)
del "%regfile%"

echo.
echo [EXTRA] Configurando excecoes de seguranca nos navegadores...
echo Aplicando politica para Google Chrome...
reg add "HKLM\SOFTWARE\Policies\Google\Chrome" /v "AutoLaunchProtocolsFromOrigins" /t REG_SZ /d "[{\"allowed_origins\": [\"*\"], \"protocol\": \"teksea-sn\"}]" /f
echo Aplicando politica para Microsoft Edge...
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge" /v "AutoLaunchProtocolsFromOrigins" /t REG_SZ /d "[{\"allowed_origins\": [\"*\"], \"protocol\": \"teksea-sn\"}]" /f

echo.
echo ===================================================
echo   INSTALACAO CONCLUIDA!
echo ===================================================
pause
