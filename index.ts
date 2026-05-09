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

// Export the storage account name
export const storageAccountName = storageAccount.name;
