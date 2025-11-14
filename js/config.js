/**
 * Environment-specific API Configuration
 * Automatically detects environment and uses appropriate endpoints
 */
let apiConfig = {
    DANDELION_API: '/api/v1',
    DANDELION_Authenticated: '/members',
    DANDELION_Globals: 'https://mylife.ngrok.app/js/globals.mjs',
    DANDELION_Root: 'https://mylife.ngrok.app',
}
window.API_CONFIG = apiConfig
import(apiConfig.DANDELION_Globals)
    .then(module=>{
        window.Globals = new module.default(null, apiConfig.DANDELION_Root)
        console.log("Globals module loaded:", window.Globals)
        window.dispatchEvent(new Event('globals-ready'))
    })
    .catch(error=>{
        console.error("Failed to load Globals module:", error)
        window.dispatchEvent(new Event('globals-fail'))
    })