@echo off
setlocal enableextensions

:: Verifica permissao de administrador e solicita se necessario
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando permissoes de administrador...
    powershell -Command "Start-Process '%0' -Verb RunAs"
    exit /b
)


echo Removendo Protocolo tms-flash...
echo.

:: Remove o registro do protocolo em HKEY_CLASSES_ROOT
reg delete "HKEY_CLASSES_ROOT\tms-flash" /f >nul 2>&1

:: Remove as excecoes de seguranca nos navegadores
echo Removendo excecoes de seguranca nos navegadores...

:: Para o Google Chrome
reg delete "HKLM\SOFTWARE\Policies\Google\Chrome" /v "AutoLaunchProtocolsFromOrigins" /f >nul 2>&1

:: Para o Microsoft Edge
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Edge" /v "AutoLaunchProtocolsFromOrigins" /f >nul 2>&1

echo.
echo ===================================================
echo DESINSTALACAO CONCLUIDA!
echo 1. O protocolo tms-flash:// foi removido.
echo 2. As politicas de seguranca foram resetadas.
echo ===================================================
pause
