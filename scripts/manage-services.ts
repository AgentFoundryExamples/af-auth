#!/usr/bin/env node

/**
 * Service Registry Management CLI
 * 
 * Usage:
 *   npm run service-registry -- add <serviceId> [options]
 *   npm run service-registry -- rotate <serviceId>
 *   npm run service-registry -- deactivate <serviceId>
 *   npm run service-registry -- activate <serviceId>
 *   npm run service-registry -- delete <serviceId>
 *   npm run service-registry -- list
 *   npm run service-registry -- show <serviceId>
 */

import * as crypto from 'crypto';
import * as readline from 'readline';
import {
  createService,
  rotateServiceApiKey,
  deactivateService,
  activateService,
  deleteService,
  listServices,
  getService,
} from '../src/services/service-registry';
import db from '../src/db';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

/**
 * Generate a cryptographically secure API key
 */
function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Add a new service to the registry
 */
async function addService(serviceIdentifier: string, options: {
  description?: string;
  scopes?: string[];
  apiKey?: string;
}): Promise<void> {
  try {
    // Check if service already exists
    const existing = await getService(serviceIdentifier);
    if (existing) {
      console.error(`❌ Error: Service '${serviceIdentifier}' already exists.`);
      console.error('Use the "rotate" command to update the API key.');
      process.exit(1);
    }
    
    // Generate or use provided API key
    const apiKey = options.apiKey || generateApiKey();
    
    // Create the service
    const service = await createService(serviceIdentifier, apiKey, {
      description: options.description,
      allowedScopes: options.scopes || [],
    });
    
    console.log('✅ Service created successfully!');
    console.log('');
    console.log('Service Details:');
    console.log(`  ID: ${service.id}`);
    console.log(`  Identifier: ${service.serviceIdentifier}`);
    console.log(`  Description: ${service.description || '(none)'}`);
    console.log(`  Scopes: ${service.allowedScopes.length > 0 ? service.allowedScopes.join(', ') : '(none)'}`);
    console.log(`  Active: ${service.isActive ? 'Yes' : 'No'}`);
    console.log('');
    console.log('⚠️  IMPORTANT: Save this API key securely. It will not be shown again!');
    console.log('');
    console.log(`API Key: ${apiKey}`);
    console.log('');
    console.log('To use this service, include the following in your requests:');
    console.log(`  Authorization: Bearer ${serviceIdentifier}:${apiKey}`);
    console.log('');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error creating service: ${errorMessage}`);
    process.exit(1);
  }
}

/**
 * Rotate a service's API key
 */
async function rotateKey(serviceIdentifier: string): Promise<void> {
  try {
    // Check if service exists
    const service = await getService(serviceIdentifier);
    if (!service) {
      console.error(`❌ Error: Service '${serviceIdentifier}' not found.`);
      process.exit(1);
    }
    
    // Generate new API key
    const newApiKey = generateApiKey();
    
    // Update the service
    await rotateServiceApiKey(serviceIdentifier, newApiKey);
    
    console.log('✅ API key rotated successfully!');
    console.log('');
    console.log('⚠️  IMPORTANT: Save this new API key securely. The old key is now invalid!');
    console.log('');
    console.log(`New API Key: ${newApiKey}`);
    console.log('');
    console.log('To use this service, include the following in your requests:');
    console.log(`  Authorization: Bearer ${serviceIdentifier}:${newApiKey}`);
    console.log('');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error rotating API key: ${errorMessage}`);
    process.exit(1);
  }
}

/**
 * Deactivate a service
 */
async function deactivate(serviceIdentifier: string): Promise<void> {
  try {
    const service = await getService(serviceIdentifier);
    if (!service) {
      console.error(`❌ Error: Service '${serviceIdentifier}' not found.`);
      process.exit(1);
    }
    
    if (!service.isActive) {
      console.log(`ℹ️  Service '${serviceIdentifier}' is already inactive.`);
      return;
    }
    
    await deactivateService(serviceIdentifier);
    console.log(`✅ Service '${serviceIdentifier}' deactivated.`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error deactivating service: ${errorMessage}`);
    process.exit(1);
  }
}

/**
 * Activate a service
 */
async function activate(serviceIdentifier: string): Promise<void> {
  try {
    const service = await getService(serviceIdentifier);
    if (!service) {
      console.error(`❌ Error: Service '${serviceIdentifier}' not found.`);
      process.exit(1);
    }
    
    if (service.isActive) {
      console.log(`ℹ️  Service '${serviceIdentifier}' is already active.`);
      return;
    }
    
    await activateService(serviceIdentifier);
    console.log(`✅ Service '${serviceIdentifier}' activated.`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error activating service: ${errorMessage}`);
    process.exit(1);
  }
}

/**
 * Delete a service
 */
async function deleteServiceCmd(serviceIdentifier: string): Promise<void> {
  try {
    const service = await getService(serviceIdentifier);
    if (!service) {
      console.error(`❌ Error: Service '${serviceIdentifier}' not found.`);
      process.exit(1);
    }
    
    const answer = await question(`⚠️  Are you sure you want to permanently delete '${serviceIdentifier}'? (yes/no): `);
    if (answer.toLowerCase() !== 'yes') {
      console.log('Cancelled.');
      return;
    }
    
    await deleteService(serviceIdentifier);
    console.log(`✅ Service '${serviceIdentifier}' deleted permanently.`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error deleting service: ${errorMessage}`);
    process.exit(1);
  }
}

/**
 * List all services
 */
async function list(activeOnly: boolean): Promise<void> {
  try {
    const services = await listServices(activeOnly);
    
    if (services.length === 0) {
      console.log('No services found.');
      return;
    }
    
    console.log(`Found ${services.length} service${services.length === 1 ? '' : 's'}:`);
    console.log('');
    
    for (const service of services) {
      const status = service.isActive ? '✓ Active' : '✗ Inactive';
      const lastUsed = service.lastUsedAt 
        ? new Date(service.lastUsedAt).toLocaleString()
        : 'Never';
      
      console.log(`• ${service.serviceIdentifier} [${status}]`);
      console.log(`  ID: ${service.id}`);
      console.log(`  Description: ${service.description || '(none)'}`);
      console.log(`  Scopes: ${service.allowedScopes.length > 0 ? service.allowedScopes.join(', ') : '(none)'}`);
      console.log(`  Created: ${new Date(service.createdAt).toLocaleString()}`);
      console.log(`  Last Used: ${lastUsed}`);
      console.log('');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error listing services: ${errorMessage}`);
    process.exit(1);
  }
}

/**
 * Show details of a specific service
 */
async function show(serviceIdentifier: string): Promise<void> {
  try {
    const service = await getService(serviceIdentifier);
    if (!service) {
      console.error(`❌ Error: Service '${serviceIdentifier}' not found.`);
      process.exit(1);
    }
    
    const status = service.isActive ? '✓ Active' : '✗ Inactive';
    const lastUsed = service.lastUsedAt 
      ? new Date(service.lastUsedAt).toLocaleString()
      : 'Never';
    
    console.log('Service Details:');
    console.log(`  ID: ${service.id}`);
    console.log(`  Identifier: ${service.serviceIdentifier}`);
    console.log(`  Status: ${status}`);
    console.log(`  Description: ${service.description || '(none)'}`);
    console.log(`  Scopes: ${service.allowedScopes.length > 0 ? service.allowedScopes.join(', ') : '(none)'}`);
    console.log(`  Created: ${new Date(service.createdAt).toLocaleString()}`);
    console.log(`  Updated: ${new Date(service.updatedAt).toLocaleString()}`);
    console.log(`  Last Used: ${lastUsed}`);
    console.log('');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error showing service: ${errorMessage}`);
    process.exit(1);
  }
}

/**
 * Main CLI handler
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log('Service Registry Management CLI');
    console.log('');
    console.log('Usage:');
    console.log('  npm run service-registry -- add <serviceId> [--description <desc>] [--scopes <scope1,scope2>]');
    console.log('  npm run service-registry -- rotate <serviceId>');
    console.log('  npm run service-registry -- deactivate <serviceId>');
    console.log('  npm run service-registry -- activate <serviceId>');
    console.log('  npm run service-registry -- delete <serviceId>');
    console.log('  npm run service-registry -- list [--all]');
    console.log('  npm run service-registry -- show <serviceId>');
    console.log('');
    process.exit(0);
  }
  
  try {
    // Connect to database
    await db.connect();
    
    switch (command) {
      case 'add': {
        const serviceId = args[1];
        if (!serviceId) {
          console.error('❌ Error: Service identifier is required.');
          console.log('Usage: npm run service-registry -- add <serviceId> [--description <desc>] [--scopes <scope1,scope2>]');
          process.exit(1);
        }
        
        const descriptionIndex = args.indexOf('--description');
        const description = descriptionIndex !== -1 && args.length > descriptionIndex + 1 && !args[descriptionIndex + 1].startsWith('--')
          ? args[descriptionIndex + 1]
          : undefined;
        
        const scopesIndex = args.indexOf('--scopes');
        const scopes = scopesIndex !== -1 && args.length > scopesIndex + 1 && !args[scopesIndex + 1].startsWith('--')
          ? args[scopesIndex + 1].split(',')
          : undefined;
        
        await addService(serviceId, { description, scopes });
        break;
      }
      
      case 'rotate': {
        const serviceId = args[1];
        if (!serviceId) {
          console.error('❌ Error: Service identifier is required.');
          console.log('Usage: npm run service-registry -- rotate <serviceId>');
          process.exit(1);
        }
        await rotateKey(serviceId);
        break;
      }
      
      case 'deactivate': {
        const serviceId = args[1];
        if (!serviceId) {
          console.error('❌ Error: Service identifier is required.');
          console.log('Usage: npm run service-registry -- deactivate <serviceId>');
          process.exit(1);
        }
        await deactivate(serviceId);
        break;
      }
      
      case 'activate': {
        const serviceId = args[1];
        if (!serviceId) {
          console.error('❌ Error: Service identifier is required.');
          console.log('Usage: npm run service-registry -- activate <serviceId>');
          process.exit(1);
        }
        await activate(serviceId);
        break;
      }
      
      case 'delete': {
        const serviceId = args[1];
        if (!serviceId) {
          console.error('❌ Error: Service identifier is required.');
          console.log('Usage: npm run service-registry -- delete <serviceId>');
          process.exit(1);
        }
        await deleteServiceCmd(serviceId);
        break;
      }
      
      case 'list': {
        const activeOnly = !args.includes('--all');
        await list(activeOnly);
        break;
      }
      
      case 'show': {
        const serviceId = args[1];
        if (!serviceId) {
          console.error('❌ Error: Service identifier is required.');
          console.log('Usage: npm run service-registry -- show <serviceId>');
          process.exit(1);
        }
        await show(serviceId);
        break;
      }
      
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log('Run without arguments to see usage.');
        process.exit(1);
    }
    
    rl.close();
    await db.disconnect();
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Fatal error: ${errorMessage}`);
    rl.close();
    await db.disconnect();
    process.exit(1);
  }
}

main();
