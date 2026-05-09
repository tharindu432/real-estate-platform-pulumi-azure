import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as storage from "@pulumi/azure-native/storage";
import * as azure from "@pulumi/azure-native";


// Create an Azure Resource Group
const resourceGroup = new azure.resources.ResourceGroup("webco-rg",{
    resourceGroupName: "webco-rg",
    location: "Australia East",
});

// Create an Azure Storage Account
const storageAccount = new azure.storage.StorageAccount("webco-sa", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
        name: azure.storage.SkuName.Standard_LRS,
    },
    kind: azure.storage.Kind.StorageV2,
});

//create media container
const mediaContainer = new azure.storage.BlobContainer("media-container", {
    accountName: storageAccount.name,
    containerName: "media-assets",
    resourceGroupName: resourceGroup.name,
    publicAccess: azure.storage.PublicAccess.Blob,
});

// azure key vault
const clientConfig = azure.authorization.getClientConfigOutput();

const keyVault = new azure.keyvault.Vault("webco-kv", {
    vaultName: "webco-kv",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    properties: {
        tenantId: clientConfig.apply(config => config.tenantId),
        sku: {
            family: "A",
            name: azure.keyvault.SkuName.Standard,
        },
        accessPolicies: [{
            tenantId: clientConfig.apply(config => config.tenantId),
            objectId: clientConfig.apply(config => config.objectId),
            permissions: {
                secrets: ["get", "list", "set", "delete"],
            },
        }],

        enableSoftDelete: true,
        softDeleteRetentionInDays: 90,
    },
});

// DB connection string secret in Key Vault
const dbConnectionString = pulumi.secret("Server=webco-db;Database=webco;User Id=admin;Password=your_password;");
const dbConnectionStringSecret = new azure.keyvault.Secret("db-connection-string", {
    secretName: "db-connection-string",
    vaultName: keyVault.name,
    resourceGroupName: resourceGroup.name,
    properties: {
        value: dbConnectionString,
        contentType: "text/plain",
    },
});

// Directus admin user secret in Key Vault
const directusAdminUser = pulumi.secret("admin");
const directusAdminUserSecret = new azure.keyvault.Secret("directus-admin-user", {
    secretName: "directus-admin-user",
    vaultName: keyVault.name,
    resourceGroupName: resourceGroup.name,
    properties: {
        value: directusAdminUser,
        contentType: "text/plain",
    },
});

//Postgres DB
const postgresAdminPassword = pulumi.secret("your_password");
const postgresServer = new azure.dbforpostgresql.Server("cms-db", {
    serverName: "webco-cms-db",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    version: "15",
    administratorLogin: "admin",
    administratorLoginPassword: postgresAdminPassword,
    sku: {
        name: "Standard_B1ms",
        tier : azure.dbforpostgresql.SkuTier.Burstable,
    },
    storage: {
        storageSizeGB: 32,
    },
    backup: {
        backupRetentionDays: 7,
        geoRedundantBackup: azure.dbforpostgresql.GeoRedundantBackup.Disabled,
    },
});

//create the cms-db
const cmsDatabase = new azure.dbforpostgresql.Database("cms-db", {
    databaseName: "cms-db",
    resourceGroupName: resourceGroup.name,
    serverName: postgresServer.name,
    charset: "UTF8",
    collation: "English_United States.1252",

});

// azure container apps
const containerAppEnv = new azure.app.ManagedEnvironment("webco-env", {
    environmentName: "webco-container-env",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
});

//actual container app running directus
const directusApp = new azure.app.ContainerApp("directus-app", {
    containerAppName: "webco-directus",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    managedEnvironmentId: containerAppEnv.id,
    configuration: {
        ingress: {
            external: true,
            targetPort: 8055,
            transport: azure.app.IngressTransportMethod.Auto,
        },
        secrets: [
            {
                name: "db-connection-string",
                value: dbConnectionString,
            },
            {
                name: "directus-admin-user",
                value: directusAdminUser,
            },
        ]
    },

    template: {
        containers: [
            {
                name: "directus",
                image: "directus/directus:latest",
                env: [
                    {
                        name: "DB_CLIENT",
                        value: "pg",
                    },
                    {
                        name: "DB_HOST",
                        value: postgresServer.fullyQualifiedDomainName,
                    },
                    {
                        name: "DB_PORT",
                        value: "5432",
                    },
                    {
                        name: "DB_NAME",
                        value: cmsDatabase.name,
                    },
                    {
                        name: "DB_USER",
                        value: "admin",
                    },
                    {
                        name: "DB_PASSWORD",
                        value: postgresAdminPassword,
                    },
                    {
                        name: "SECRET_KEY",
                        value: pulumi.secret("your_secret_key"),
                    },
                    {
                        name : "STORAGE_LOCATIONS",
                        value: "azure-blob",
                    },
                    {
                        name: "AZURE_BLOB_ACCOUNT_NAME",
                        value: storageAccount.name,
                    },
                     {
                        name: "STORAGE_AZURE_DRIVER",
                        value: "azure",
                     },
                     {
                        name: "STORAGE_AZURE_CONTAINER_NAME",
                        value: "media-assets",
                     }
        
                ],

                    resources: {
                        cpu: 0.5,
                        memory: "1Gi",
                    },
            },
        ],

        //scaline rules for the container app
            scale: {
                minReplicas: 1,
                maxReplicas: 3,
                rules: [
                    {
                        name: "http-scaling",
                        http: {
                            metadata: {
                                concurrentRequests: "50",
                            },
                        },
                    },
                ],
            },
    },
});

//output the URL of the Directus app
export const directusAppUrl = directusApp.configuration.apply(config => config?.ingress?.fqdn ? `https://${config.ingress.fqdn}` : "URL not available");
export const keyVaultUri = keyVault.properties.apply(props => props.vaultUri);
export const postgresServerName = postgresServer.fullyQualifiedDomainName;
export const postgresAdminUsername = postgresServer.administratorLogin;

// Export the storage account name
export const storageAccountName = storageAccount.name;
