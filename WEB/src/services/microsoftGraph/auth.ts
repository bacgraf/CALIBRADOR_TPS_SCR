import * as msal from "@azure/msal-browser";

const msalConfig = {
    auth: {
        clientId: "58454a49-a299-40b0-9566-372bdab155db",
        authority: "https://login.microsoftonline.com/f03ed2fc-3f7d-4cd8-bbd7-cf47c853931c",
        redirectUri: "https://bacgraf.github.io/teksea-auth/auth-redirect.html"
    },
    cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: true
    }
};

const msalInstance = new msal.PublicClientApplication(msalConfig);
let isMsalInitialized = false;

export const GraphAuth = {
    initialize: async () => {
        if (!isMsalInitialized) {
            await msalInstance.initialize();
            isMsalInitialized = true;
            console.log("[GraphAuth] MSAL Inicializado via Bridge");

            // Escuta a mensagem vindo do popup do GitHub
            window.addEventListener('message', async (event) => {
                if (event.data && event.data.type === 'MSAL_AUTH_RESPONSE') {
                    console.log("[GraphAuth] Hash recebido do Bridge!");
                    try {
                        const response = await msalInstance.handleRedirectPromise(event.data.hash);
                        if (response) {
                            console.log("[GraphAuth] Login concluído via Bridge:", response.account?.username);
                        }
                    } catch (err) {
                        console.error("[GraphAuth] Erro ao processar hash do Bridge:", err);
                    }
                }
            });
        }
    },

    login: async () => {
        if (!isMsalInitialized) await GraphAuth.initialize();
        
        const loginRequest = {
            scopes: ["User.Read", "Files.ReadWrite", "Sites.ReadWrite.All"]
        };

        try {
            const response = await msalInstance.loginPopup(loginRequest);
            msalInstance.setActiveAccount(response.account);
            return response.account;
        } catch (error: any) {
            console.error("[GraphAuth] Erro no popup:", error);
            throw error;
        }
    },

    getAccessToken: async (): Promise<string> => {
        if (!isMsalInitialized) await GraphAuth.initialize();
        
        const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
        if (!account) throw new Error("Usuário não está logado.");

        const request = {
            scopes: ["User.Read", "Files.ReadWrite", "Sites.ReadWrite.All"],
            account: account
        };

        try {
            const response = await msalInstance.acquireTokenSilent(request);
            return response.accessToken;
        } catch (error) {
            console.warn("[GraphAuth] acquireTokenSilent falhou. Requer interação.");
            throw error; // Não pode chamar popup aqui senão quebra o fluxo
        }
    },

    getActiveAccount: () => {
        return msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0] || null;
    },

    logout: () => {
        msalInstance.logoutPopup().catch(console.error);
    }
};
