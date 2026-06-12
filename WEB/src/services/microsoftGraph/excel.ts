// src/services/microsoftGraph/excel.ts
import { Client } from "@microsoft/microsoft-graph-client";
import { GraphAuth } from "./auth";

// Cache do site ID para evitar chamadas repetidas
let cachedSiteId: string | null = null;

async function getGraphClient() {
    const token = await GraphAuth.getAccessToken();
    return Client.init({
        authProvider: (done) => done(null, token)
    });
}

async function getSiteId(client: any, hostname: string, sitePath: string): Promise<string> {
    if (cachedSiteId) return cachedSiteId;
    
    const site = await client.api(`/sites/${hostname}:/sites/${sitePath}`).get();
    cachedSiteId = site.id;
    console.log("[GraphExcel] Site ID:", site.id);
    return site.id;
}

export const GraphExcel = {
    /**
     * Adiciona linhas a uma tabela no Excel Online (SharePoint)
     * @param hostname Ex: "teksea.sharepoint.com"
     * @param sitePath Ex: "106FAB"
     * @param fileName Ex: "NUMERO SERIE UGE (USAR ESSE) - Copia.xlsx"
     * @param tableName Ex: "Tabela1"
     * @param rows Array de dados [[col1, col2, ...], ...]
     */
    addRowsToTable: async (
        hostname: string,
        sitePath: string,
        fileName: string,
        tableName: string,
        rows: any[][]
    ) => {
        const client = await getGraphClient();

        // 1. Obter o ID do site SharePoint
        const siteId = await getSiteId(client, hostname, sitePath);

        // 2. Buscar o arquivo pelo nome na biblioteca de documentos
        const searchResult = await client
            .api(`/sites/${siteId}/drive/root/search(q='${fileName}')`)
            .get();

        if (!searchResult.value || searchResult.value.length === 0) {
            throw new Error(`Arquivo '${fileName}' não encontrado no SharePoint.`);
        }

        // Pega o primeiro resultado que bate com o nome exato
        const file = searchResult.value.find((f: any) => f.name === fileName)
            || searchResult.value[0];
        
        const itemId = file.id;
        console.log("[GraphExcel] Arquivo encontrado:", file.name, "ID:", itemId);

        // 3. Verificar quantas colunas a tabela tem
        const basePath = `/sites/${siteId}/drive/items/${itemId}/workbook/tables/${tableName}`;
        
        const columns = await client.api(`${basePath}/columns`).get();
        const columnNames = columns.value.map((c: any) => c.name);
        const expectedCols = columnNames.length;
        
        console.log(`[GraphExcel] Tabela '${tableName}' tem ${expectedCols} colunas:`, columnNames);
        console.log(`[GraphExcel] Dados sendo enviados com ${rows[0]?.length} colunas.`);

        // Ajustar linhas se tiverem colunas a mais ou a menos
        const adjustedRows = rows.map(row => {
            if (row.length > expectedCols) {
                return row.slice(0, expectedCols); // Corta colunas extras
            }
            while (row.length < expectedCols) {
                row.push(""); // Preenche colunas faltando
            }
            return row;
        });

        // 4. Adicionar linhas à tabela
        const response = await client.api(`${basePath}/rows/add`).post({
            values: adjustedRows
        });

        console.log("[GraphExcel] Linhas adicionadas com sucesso!");
        return response;
    }
};
