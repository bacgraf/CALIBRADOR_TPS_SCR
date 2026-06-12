@echo off
setlocal enableextensions

:: Verifica permissao de administrador e solicita se necessario
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando permissoes de administrador...
    powershell -Command "Start-Process '%0' -Verb RunAs"
    exit /b
)

set "bridge_exe=%~dp0tms_bridge.exe"

echo Registrando Protocolo tms-flash para:
echo %bridge_exe%
echo.

:: Cria o arquivo .reg temporário com caminhos escapados
set "regfile=%temp%\tms_flash_reg.reg"
echo Windows Registry Editor Version 5.00 > "%regfile%"
echo. >> "%regfile%"
echo [HKEY_CLASSES_ROOT\tms-flash] >> "%regfile%"
echo @="URL:TMS Flash Protocol" >> "%regfile%"
echo "URL Protocol"="" >> "%regfile%"
echo. >> "%regfile%"
echo [HKEY_CLASSES_ROOT\tms-flash\shell] >> "%regfile%"
echo. >> "%regfile%"
echo [HKEY_CLASSES_ROOT\tms-flash\shell\open] >> "%regfile%"
echo. >> "%regfile%"
echo [HKEY_CLASSES_ROOT\tms-flash\shell\open\command] >> "%regfile%"

:: Escape de backslashes para o registro
set "escaped_path=%bridge_exe:\=\\%"
echo @="\"%escaped_path%\" \"%%1\"" >> "%regfile%"

:: Executa o registro (pede admin)
regedit.exe /s "%regfile%"
del "%regfile%"

echo.
echo [3/3] Configurando excecoes de seguranca nos navegadores...
:: Para o Google Chrome
reg add "HKLM\SOFTWARE\Policies\Google\Chrome" /v "AutoLaunchProtocolsFromOrigins" /t REG_SZ /d "[{\"allowed_origins\": [\"*\"], \"protocol\": \"tms-flash\"}]" /f >nul 2>&1
:: Para o Microsoft Edge
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge" /v "AutoLaunchProtocolsFromOrigins" /t REG_SZ /d "[{\"allowed_origins\": [\"*\"], \"protocol\": \"tms-flash\"}]" /f >nul 2>&1

echo.
echo ===================================================
echo INSTALACAO CONCLUIDA!
echo 1. O protocolo tms-flash:// foi registrado.
echo 2. Os avisos do Chrome/Edge foram silenciados.
echo ===================================================
echo Certifique-se de que o arquivo 'tms_bridge.exe' está nesta pasta.
pause
