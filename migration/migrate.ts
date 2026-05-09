import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import { directusAppUrl } from '../infrastructure';

// 1. configuration

const CONFIG = {
    directusUrl : process.env.DIRECTUS_URL || directusAppUrl,

    //auth token to create records via API
    directusToken: process.env.DIRECTUS_TOKEN || "your_directus_token",

    // the directus collection name to which the data will be migrated
    directusCollection: "properties",

    //retry settings for API calls
    retryAttempts: 5,
    retryDelay: 2000, // in milliseconds

};

//2. TYPE DEFINITIONS

//data coming from sanity
interface SanityListing {
  _id: string;
  title: string;
  price: number;
  suburb: string;
  publishedAt: string;
  active: boolean;
}

// data going to directus
interface DirectusListing {
  external_id: string;
  listing_title: string;
  asking_price: number;
  location: string;
  date_published: string;
  status: "published" | "draft";
}

//tracck how each record migration went
interface MigrationResult {
    sanityId: string;
    directusId?: string;
    success: boolean;
    error?: string;
}

// 3. Source data
const sanityListings: SanityListing[] = [
    {
        _id: "1",
        title: "Beautiful Beachside Apartment",
        price: 750000,
        suburb: "Bondi Beach",
        publishedAt: "2024-01-15T10:00:00Z",
        active: true,
    },
    {
        _id: "2",
        title: "Modern City Loft",
        price: 650000,
        suburb: "Sydney CBD",
        publishedAt: "2024-02-20T14:30:00Z",
        active: true,
    }
];

// 4. Data transformation function
function transformToDirectus(sanityListing: SanityListing): DirectusListing {
    return {
        external_id: sanityListing._id,
        listing_title: sanityListing.title,
        asking_price: sanityListing.price,
        location: sanityListing.suburb,
        date_published: sanityListing.publishedAt,
        status: sanityListing.active ? "published" : "draft",
    };
}

// 5. API call function with retry logic
async function createDirectusRecord(listing: DirectusListing): Promise<string> {
    const url = `${CONFIG.directusUrl}/items/${CONFIG.directusCollection}`;
    const headers = {
        Authorization: `Bearer ${CONFIG.directusToken}`,
        'Content-Type': 'application/json',
    };
    
    for (let attempt = 1; attempt <= CONFIG.retryAttempts; attempt++) {
        try {
            const response = await axios.post(url, listing, { headers });
            return response.data.data.id; // assuming directus returns the created record's ID in this path
        }
        catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Attempt ${attempt} failed for listing ${listing.external_id}:`, message);
            if (attempt === CONFIG.retryAttempts) {
                throw new Error(`Failed to create record for listing ${listing.external_id} after ${CONFIG.retryAttempts} attempts: ${message}`);
            }
            await new Promise(res => setTimeout(res, CONFIG.retryDelay));
        }
    }
    throw new Error(`Unexpected error in createDirectusRecord for listing ${listing.external_id}`);
}

// 6. Main migration function
async function migrateListings() {
    const results: MigrationResult[] = [];
    for (const sanityListing of sanityListings) {
        const directusListing = transformToDirectus(sanityListing);
        try {
            const directusId = await createDirectusRecord(directusListing);
            results.push({
                sanityId: sanityListing._id,
                directusId,
                success: true,
            });
            console.log(`Successfully migrated listing ${sanityListing._id} to Directus with ID ${directusId}`);
        }
        catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            results.push({
                sanityId: sanityListing._id,
                success: false,
                error: message,
            });
            console.error(`Failed to migrate listing ${sanityListing._id}:`, message);
        }
    }
    return results;
}

// 7. Execute migration
migrateListings()
    .then(results => {
        console.log("Migration completed. Summary:");
        results.forEach(result => {
            if (result.success) {
                console.log(`- Sanity ID ${result.sanityId} migrated successfully as Directus ID ${result.directusId}`);
            }
            else {
                console.log(`- Sanity ID ${result.sanityId} failed to migrate. Error: ${result.error}`);
            }
        });
    })
    .catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Migration process encountered an error:", message);
    });

    // 8. Entry point for running the script via command line
if (require.main === module) {
    migrateListings()
        .then(() => {
            console.log("Migration script finished.");
            process.exit(0);
        })
        .catch(error => {
            const message = error instanceof Error ? error.message : String(error);
            console.error("Migration script encountered an error:", message);
            process.exit(1);
        });
}



