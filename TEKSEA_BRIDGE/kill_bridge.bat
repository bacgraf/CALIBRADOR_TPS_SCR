@echo off
echo Encerrando Teksea Bridge...
taskkill /F /IM pythonw.exe /T 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Bridge encerrado com sucesso.
) else (
    echo [!] Nenhum processo do Bridge encontrado rodando.
)
timeout /t 2
