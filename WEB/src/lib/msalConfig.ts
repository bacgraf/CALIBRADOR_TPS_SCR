import { Configuration, PublicClientApplication } from "@azure/msal-browser";

export const msalConfig: Configuration = {
    auth: {
        clientId: "be1dcdd6-165e-4c85-9e5a-352cce01dcad",
        authority: "https://login.microsoftonline.com/f03ed2fc-3f7d-4cd8-bbd7-cf47c853931c",
        redirectUri: window.location.origin // Detecta automaticamente se é localhost ou IP do ESP32
    },
    cache: {
        cacheLocation: "localStorage",

    }
};

export const msalInstance = new PublicClientApplication(msalConfig);

// Initialize happens in App.tsx
