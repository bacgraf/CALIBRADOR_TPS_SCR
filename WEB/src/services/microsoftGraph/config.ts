// src/services/microsoftGraph/config.ts

export const msalConfig = {
    auth: {
        clientId: "58454a49-a299-40b0-9566-372bdab155db", // Client ID fornecido
        authority: "https://login.microsoftonline.com/f03ed2fc-3f7d-4cd8-bbd7-cf47c853931c", // Tenant ID da sua organização
    redirectUri: window.location.origin, // Volta para a página atual após o login
},
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false,
    },
    system: {
        allowRedirectInIframe: true,
        navigateToLoginRequestUrl: false // Impede o redirecionamento interno no pop-up
    }
};

// Escopos necessários para ler o perfil e editar arquivos no Excel/OneDrive
export const loginRequest = {
    scopes: [
        "User.Read",            // Login e perfil do operador
        "Files.ReadWrite",      // OneDrive pessoal
        "Files.ReadWrite.All",  // Todos os arquivos acessíveis (OneDrive + SharePoint)
        "Sites.ReadWrite.All",  // Acesso direto aos sites SharePoint
        "offline_access"        // Mantém sessão ativa (token de refresh)
    ]
};
