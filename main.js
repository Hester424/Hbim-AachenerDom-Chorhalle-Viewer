const BASE_PATH = import.meta.env.BASE_URL || '/';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IFCLoader } from 'web-ifc-three/IFCLoader';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e293b);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(35, 30, 35);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(20, 30, 20);
scene.add(dirLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Variables
let ifcModel = null;
let semanticData = {};
let selectedExpressID = null;
let noSemanticIDs = []; // Store IDs of components without semantic data
let semanticIDs = []; // Store IDs of components with semantic data

const ifcLoader = new IFCLoader();
ifcLoader.ifcManager.setWasmPath('./');

const highlightMaterial = new THREE.MeshLambertMaterial({
    color: 0x00aaff,
    transparent: true,
    opacity: 0.7,
    depthTest: true
});

// Yellow highlight material for timeline event components
const timelineHighlightMaterial = new THREE.MeshLambertMaterial({
    color: 0xffaa00,
    transparent: true,
    opacity: 0.7,
    depthTest: true
});

// Material for IFC components without semantic data (semi-transparent)
const noSemanticMaterial = new THREE.MeshLambertMaterial({
    color: 0x888888,
    transparent: true,
    opacity: 0.85,
    depthTest: true
});

// Material for IFC components with semantic data (normal appearance)
const semanticMaterial = new THREE.MeshLambertMaterial({
    color: 0xcccccc,
    transparent: false,
    opacity: 1.0,
    depthTest: true
});

// Helper Functions
function updateProgress(percent, text = '') {
    document.getElementById('progress-fill').style.width = `${Math.min(percent, 100)}%`;
    if (text) document.getElementById('progress-text').textContent = text;
}

function clearUI() {
    document.getElementById('gid').innerHTML = 'Double-click to select element';
    document.getElementById('eid').textContent = '-';
    document.getElementById('level').textContent = '-';
    document.getElementById('side').textContent = '-';
    
    document.getElementById('photos-content').innerHTML = '<div class="empty-state">No photos available</div>';
    document.getElementById('damage-content').innerHTML = '<div class="empty-state">No damage records</div>';
}

function formatRepairAction(action) {
    if (!action) return '';
    return action.replace(/([A-Z])/g, ' $1').trim();
}

// Get photo URLs from semantic data
function getPhotoURLs(globalId) {
    if (!globalId || !semanticData[globalId]) return [];
    
    const componentData = semanticData[globalId];
    const photos = componentData.Photos || [];
    
    // Convert photo paths to objects with url and label
    return photos.map((photoPath, index) => {
        // Normalize path: handle backslashes and remove public/ prefix
        const cleanPath = photoPath
            .replace(/\\/g, '/')           // Windows paths
            .replace(/^\/?(public\/)?/, ''); // Remove public/ prefix
        
        return {
            url: `${BASE_PATH}${cleanPath}`,
            label: `Photo ${index + 1}`
        };
    });
}

// Image modal handlers
function setupImageModal() {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const closeBtn = modal.querySelector('.modal-close');
    
    closeBtn.onclick = () => modal.classList.remove('active');
    
    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.remove('active');
    };
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            modal.classList.remove('active');
        }
    });
}

function openImageModal(imageUrl) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    modalImg.src = imageUrl;
    modal.classList.add('active');
}

// Display photos for component
function displayPhotos(globalId) {
    const photosContainer = document.getElementById('photos-content');
    
    if (!globalId) {
        photosContainer.innerHTML = '<div class="empty-state">No photos available</div>';
        return;
    }
    
    const photoURLs = getPhotoURLs(globalId);
    
    // Check which photos actually exist
    let validPhotos = [];
    let loadedCount = 0;
    
    photoURLs.forEach(photoData => {
        const img = new Image();
        img.onload = () => {
            validPhotos.push(photoData);
            loadedCount++;
            if (loadedCount === photoURLs.length) {
                renderPhotos(validPhotos, photosContainer);
            }
        };
        img.onerror = () => {
            loadedCount++;
            if (loadedCount === photoURLs.length) {
                renderPhotos(validPhotos, photosContainer);
            }
        };
        img.src = photoData.url;
    });
}

function renderPhotos(validPhotos, container) {
    if (validPhotos.length === 0) {
        container.innerHTML = '<div class="empty-state">No photos available</div>';
        return;
    }
    
    const photosHTML = validPhotos.map(photo => `
        <a class="photo-link" data-photo-url="${photo.url}">
            <span class="photo-link-text">${photo.label}</span>
            <span class="photo-link-icon">→</span>
        </a>
    `).join('');
    
    container.innerHTML = photosHTML;
    
    // Add click handlers
    container.querySelectorAll('.photo-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            openImageModal(link.dataset.photoUrl);
        });
    });
}

// Load semantic data
async function loadSemanticData() {
    try {
        updateProgress(10, 'Loading semantic data from RDF/TTL...');
        
        const response = await fetch('./semantic_data.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        semanticData = await response.json();
        
        const componentCount = Object.keys(semanticData).length;
        console.log(`✅ Loaded ${componentCount} components from semantic database`);
        
        updateProgress(30, `Loaded ${componentCount} components`);
        return true;
        
    } catch (err) {
        console.error('❌ Failed to load semantic data:', err);
        semanticData = {};
        updateProgress(20, 'Warning: No semantic data available');
        return false;
    }
}

// Load IFC model
async function loadIFCModel() {
    return new Promise((resolve, reject) => {
        updateProgress(40, 'Loading IFC model...');

        ifcLoader.load(
            './model.ifc',
            (model) => {
                ifcModel = model;
                scene.add(ifcModel);

                // Auto-fit camera
                const box = new THREE.Box3().setFromObject(ifcModel);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());

                controls.target.copy(center);

                const maxDim = Math.max(size.x, size.y, size.z);
                const fov = camera.fov * (Math.PI / 180);
                let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
                cameraZ *= 1.5;

                camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ);
                camera.lookAt(center);
                controls.update();

                console.log('✅ IFC model loaded');
                updateProgress(80, 'Model loaded');
                resolve(model);
            },
            (progress) => {
                const percent = 40 + (progress.loaded / progress.total) * 40;
                updateProgress(percent, `Loading: ${(progress.loaded / 1024 / 1024).toFixed(1)}MB`);
            },
            (error) => {
                console.error('❌ Failed to load IFC model:', error);
                reject(error);
            }
        );
    });
}

// Apply transparent material to IFC components without semantic data
async function applyNoSemanticMaterial() {
    if (!ifcModel || Object.keys(semanticData).length === 0) {
        console.warn('⚠️ Cannot apply no-semantic material: model or semantic data not ready');
        return;
    }

    updateProgress(85, 'Processing components...');

    try {
        const modelID = 0;
        const idsWithSemantic = [];
        const idsWithoutSemantic = [];

        // Get spatial structure to find all element IDs
        const spatialStructure = await ifcLoader.ifcManager.getSpatialStructure(modelID);

        // Recursive function to collect all ExpressIDs
        function collectIDs(element) {
            const ids = [];
            if (element.expressID !== undefined) {
                ids.push(element.expressID);
            }
            if (element.children) {
                element.children.forEach(child => {
                    ids.push(...collectIDs(child));
                });
            }
            return ids;
        }

        const allIDs = collectIDs(spatialStructure);
        console.log(`📊 Found ${allIDs.length} elements in spatial structure`);

        // Check each element for semantic data
        for (const expressID of allIDs) {
            try {
                const props = await ifcLoader.ifcManager.getItemProperties(modelID, expressID);
                const globalId = props?.GlobalId?.value;

                // Categorize by whether it has semantic data
                if (globalId && semanticData[globalId]) {
                    idsWithSemantic.push(expressID);
                } else {
                    idsWithoutSemantic.push(expressID);
                }
            } catch (error) {
                // Skip elements that can't be accessed
                continue;
            }
        }

        console.log(`📊 Found ${idsWithSemantic.length} components WITH semantic data`);
        console.log(`📊 Found ${idsWithoutSemantic.length} components WITHOUT semantic data`);

        // Store globally for later use
        semanticIDs = idsWithSemantic;
        noSemanticIDs = idsWithoutSemantic;

        // Hide original model
        ifcModel.visible = false;

        // Create subsets for both types
        showSemanticSubsets();

        updateProgress(95, 'Components processed');

    } catch (error) {
        console.error('❌ Error applying no-semantic material:', error);
    }
}

// Show both semantic subsets (opaque for semantic, transparent for non-semantic)
function showSemanticSubsets() {
    // Show components WITH semantic data (normal opaque material)
    if (semanticIDs.length > 0) {
        ifcLoader.ifcManager.createSubset({
            modelID: 0,
            ids: semanticIDs,
            scene: scene,
            removePrevious: true,
            material: semanticMaterial
        });
    }
    // Show components WITHOUT semantic data (transparent material)
    if (noSemanticIDs.length > 0) {
        ifcLoader.ifcManager.createSubset({
            modelID: 0,
            ids: noSemanticIDs,
            scene: scene,
            removePrevious: true,
            material: noSemanticMaterial
        });
    }
}

// Display component info
function displayComponentInfo(globalId, expressID, component) {
    const ui = {
        gid: document.getElementById('gid'),
        eid: document.getElementById('eid'),
        level: document.getElementById('level'),
        side: document.getElementById('side'),
        damageContent: document.getElementById('damage-content')
    };

    // Basic info
    ui.gid.innerHTML = globalId || 'N/A';
    ui.eid.textContent = component.CorrectedID || expressID;
    ui.level.textContent = component.Level || 'N/A';
    ui.side.textContent = component.Side || 'N/A';

    // Display photos
    displayPhotos(globalId);

    // Damage info - using same format as other sections
    if (component.Damages && component.Damages.length > 0) {
        const damagesHTML = component.Damages.map(damage => {
            const repairAction = formatRepairAction(damage.RepairAction);
            
            return `
                <div class="prop-item">
                    <span class="prop-label">Damage Type</span>
                    <div class="prop-value">${damage.DamageType || 'Unknown'}</div>
                </div>
                
                <div class="prop-item">
                    <span class="prop-label">Description</span>
                    <div class="prop-value">${damage.DamageText || 'No description available'}</div>
                </div>
                
                ${damage.RepairAction ? `
                    <div class="prop-item">
                        <span class="prop-label">Repair Action</span>
                        <div class="prop-value">${repairAction}</div>
                    </div>
                ` : ''}
                
                ${component.Damages.length > 1 && component.Damages.indexOf(damage) < component.Damages.length - 1 ? 
                    '<div style="height: 20px; border-bottom: 1px solid rgba(255,255,255,0.05); margin: 16px 0;"></div>' : ''}
            `;
        }).join('');
        
        ui.damageContent.innerHTML = damagesHTML;
    } else {
        ui.damageContent.innerHTML = '<div class="empty-state">No damage records</div>';
    }

    // Console log
    console.group(`Component Selected`);
    console.log('GlobalID:', globalId);
    console.log('CorrectedID:', component.CorrectedID);
    console.log('Location:', { Level: component.Level, Side: component.Side });
    if (component.Damages) console.log('Damages:', component.Damages);
    console.groupEnd();
}

// Interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('dblclick', async (event) => {
    if (!ifcModel) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(ifcModel, true);

    if (intersects.length > 0) {
        const index = intersects[0].faceIndex;
        const expressID = ifcLoader.ifcManager.getExpressId(ifcModel.geometry, index);
        
        if (expressID === selectedExpressID) {
            // Deselect - remove highlight
            ifcLoader.ifcManager.removeSubset(0, highlightMaterial);
            selectedExpressID = null;
            clearUI();
            return;
        }

        selectedExpressID = expressID;

        // Remove old highlight (keep non-semantic subset visible)
        ifcLoader.ifcManager.removeSubset(0, highlightMaterial);

        try {
            // Get IFC properties first to determine which material to use
            const props = await ifcLoader.ifcManager.getItemProperties(0, expressID);
            const globalId = props.GlobalId?.value;

            // Check if semantic data exists for this component
            const hasSemanticData = globalId && semanticData[globalId];

            // Create highlight (always use blue highlight material when clicking)
            ifcLoader.ifcManager.createSubset({
                modelID: 0,
                ids: [expressID],
                scene: scene,
                removePrevious: true,
                material: highlightMaterial
            });

            // Try to find semantic data
            if (hasSemanticData) {
                // Found semantic data
                const component = semanticData[globalId];
                displayComponentInfo(globalId, expressID, component);

            } else {
                // No semantic data - show all fields as N/A
                console.warn('⚠️ No semantic data for GlobalID:', globalId, '(IFC ExpressID:', expressID, ')');

                document.getElementById('gid').innerHTML = globalId || 'N/A';
                document.getElementById('eid').textContent = 'N/A';
                document.getElementById('level').textContent = 'N/A';
                document.getElementById('side').textContent = 'N/A';
                document.getElementById('photos-content').innerHTML = '<div class="empty-state">No photos available</div>';
                document.getElementById('damage-content').innerHTML = '<div class="empty-state">No semantic data available for this IFC component</div>';
            }
            
        } catch (error) {
            console.error('❌ Error:', error);
            clearUI();
        }
        
    } else {
        // Clicked empty space - remove all highlights
        ifcLoader.ifcManager.removeSubset(0, highlightMaterial);
        ifcLoader.ifcManager.removeSubset(0, timelineHighlightMaterial);
        selectedExpressID = null;
        clearUI();
        // Clear timeline event active state
        document.querySelectorAll('.timeline-event.active').forEach(card => {
            card.classList.remove('active');
        });
    }
});

// ESC to deselect
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        ifcLoader.ifcManager.removeSubset(0, highlightMaterial);
        ifcLoader.ifcManager.removeSubset(0, timelineHighlightMaterial);
        selectedExpressID = null;
        clearUI();
        // Clear timeline event active state
        document.querySelectorAll('.timeline-event.active').forEach(card => {
            card.classList.remove('active');
        });
    }
});

// Single click on empty 3D space to clear all highlights
window.addEventListener('click', (event) => {
    // Only handle clicks on the canvas (not on UI panels)
    const target = event.target;
    const isCanvas = target.tagName === 'CANVAS';

    if (isCanvas && ifcModel) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(ifcModel, true);

        // If clicked on empty space (no intersection with model)
        if (intersects.length === 0) {
            // Clear all highlights (blue + yellow)
            ifcLoader.ifcManager.removeSubset(0, highlightMaterial);
            ifcLoader.ifcManager.removeSubset(0, timelineHighlightMaterial);
            selectedExpressID = null;
            clearUI();
            // Clear timeline event active state
            document.querySelectorAll('.timeline-event.active').forEach(card => {
                card.classList.remove('active');
            });
        }
    }
});

// ============================================================================
// QUERY PANEL FUNCTIONS
// ============================================================================

// Populate filter dropdowns
function populateFilters() {
    const levels = new Set();
    const sides = new Set();
    const damageTypes = new Set();
    const repairActions = new Set();

    Object.values(semanticData).forEach(component => {
        if (component.Level) levels.add(component.Level);
        if (component.Side) sides.add(component.Side);
        
        if (component.Damages) {
            component.Damages.forEach(damage => {
                if (damage.DamageType) damageTypes.add(damage.DamageType);
                if (damage.RepairAction) repairActions.add(damage.RepairAction);
            });
        }
    });

    // Populate Level dropdown
    const levelSelect = document.getElementById('filter-level');
    Array.from(levels).sort().forEach(level => {
        const option = document.createElement('option');
        option.value = level;
        option.textContent = level;
        levelSelect.appendChild(option);
    });

    // Populate Side dropdown
    const sideSelect = document.getElementById('filter-side');
    Array.from(sides).sort().forEach(side => {
        const option = document.createElement('option');
        option.value = side;
        option.textContent = side;
        sideSelect.appendChild(option);
    });

    // Populate Damage Type dropdown
    const damageTypeSelect = document.getElementById('filter-damage-type');
    Array.from(damageTypes).sort().forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        damageTypeSelect.appendChild(option);
    });

    // Populate Repair Action dropdown
    const repairSelect = document.getElementById('filter-repair');
    Array.from(repairActions).sort().forEach(action => {
        const option = document.createElement('option');
        option.value = action;
        option.textContent = formatRepairAction(action);
        repairSelect.appendChild(option);
    });
}

// Search by CorrectedID
window.searchByID = function() {
    const searchValue = document.getElementById('search-id').value.trim();
    
    if (!searchValue) {
        alert('Please enter a CorrectedID');
        return;
    }

    const results = [];
    
    for (const [globalId, component] of Object.entries(semanticData)) {
        if (component.CorrectedID === searchValue) {
            results.push({ globalId, component });
        }
    }

    if (results.length === 0) {
        alert(`No component found with CorrectedID: ${searchValue}`);
        document.getElementById('results-count').textContent = '0';
        document.getElementById('results-list').innerHTML = '<div class="empty-state">No components found</div>';
        return;
    }

    displayResults(results);
    
    // Highlight in 3D if found
    if (results.length === 1) {
        console.log('Highlighting component:', results[0].globalId);
        window.highlightComponentByGlobalId(results[0].globalId);
    } else if (results.length > 1) {
        alert(`Found ${results.length} components with CorrectedID: ${searchValue}\nClick on a result to highlight it.`);
    }
};

// Apply filters
window.applyFilters = function() {
    const levelFilter = document.getElementById('filter-level').value;
    const sideFilter = document.getElementById('filter-side').value;
    const damageTypeFilter = document.getElementById('filter-damage-type').value;
    const repairFilter = document.getElementById('filter-repair').value;

    const results = [];

    for (const [globalId, component] of Object.entries(semanticData)) {
        let match = true;

        // Check Level
        if (levelFilter && component.Level !== levelFilter) {
            match = false;
        }

        // Check Side
        if (sideFilter && component.Side !== sideFilter) {
            match = false;
        }

        // Check Damage Type
        if (damageTypeFilter && match) {
            const hasDamageType = component.Damages?.some(d => d.DamageType === damageTypeFilter);
            if (!hasDamageType) match = false;
        }

        // Check Repair Action
        if (repairFilter && match) {
            const hasRepairAction = component.Damages?.some(d => d.RepairAction === repairFilter);
            if (!hasRepairAction) match = false;
        }

        if (match) {
            results.push({ globalId, component });
        }
    }

    displayResults(results);
};

// Clear all filters
window.clearFilters = function() {
    document.getElementById('search-id').value = '';
    document.getElementById('filter-level').value = '';
    document.getElementById('filter-side').value = '';
    document.getElementById('filter-damage-type').value = '';
    document.getElementById('filter-repair').value = '';
    document.getElementById('results-list').innerHTML = '';
    document.getElementById('results-count').textContent = '0';
    
    // Clear highlight
    if (ifcLoader && ifcModel) {
        ifcLoader.ifcManager.removeSubset(0, highlightMaterial);
        selectedExpressID = null;
        clearUI();
    }
};

// Display query results
function displayResults(results) {
    const resultsCount = document.getElementById('results-count');
    const resultsList = document.getElementById('results-list');

    resultsCount.textContent = results.length;

    if (results.length === 0) {
        resultsList.innerHTML = '<div class="empty-state">No components found</div>';
        return;
    }

    resultsList.innerHTML = results.map(({ globalId, component }) => `
        <div class="result-item" onclick="window.highlightComponentByGlobalId('${globalId}')">
            <div class="result-item-id">ID: ${component.CorrectedID || 'N/A'}</div>
            <div class="result-item-details">
                <span>Level: ${component.Level || 'N/A'}</span>
                <span>Side: ${component.Side || 'N/A'}</span>
            </div>
        </div>
    `).join('');
}

// Highlight component by GlobalId
window.highlightComponentByGlobalId = async function(globalId) {
    if (!ifcLoader || !ifcModel) {
        console.warn('⚠️ IFC Model not loaded yet');
        alert('IFC Model is not loaded yet. Please wait.');
        return;
    }

    try {
        console.log('🔍 Searching for component:', globalId);
        
        // Get all spatial structure elements (this includes building elements)
        const modelID = 0;
        
        // Try different methods to get all elements
        let allIDs = [];
        
        try {
            // Method 1: Get all items (most reliable)
            const properties = await ifcLoader.ifcManager.getSpatialStructure(modelID);
            
            // Recursive function to collect all ExpressIDs
            function collectIDs(element) {
                const ids = [];
                if (element.expressID !== undefined) {
                    ids.push(element.expressID);
                }
                if (element.children) {
                    element.children.forEach(child => {
                        ids.push(...collectIDs(child));
                    });
                }
                return ids;
            }
            
            allIDs = collectIDs(properties);
            console.log(`📊 Found ${allIDs.length} elements in spatial structure`);
            
        } catch (error) {
            console.warn('Could not get spatial structure:', error);
            
            // Method 2: Brute force - try sequential IDs
            console.log('📊 Trying brute force search...');
            const maxID = 10000; // Adjust based on your model size
            for (let i = 1; i < maxID; i++) {
                allIDs.push(i);
            }
        }
        
        // Search through all elements
        let found = false;
        for (const expressID of allIDs) {
            try {
                const props = await ifcLoader.ifcManager.getItemProperties(modelID, expressID);
                
                if (props && props.GlobalId && props.GlobalId.value === globalId) {
                    // Found it! Highlight
                    selectedExpressID = expressID;
                    found = true;
                    
                    console.log('✅ Found component with ExpressID:', expressID);

                    // Remove old highlight
                    ifcLoader.ifcManager.removeSubset(modelID, highlightMaterial);

                    // Create new highlight (query results always have semantic data)
                    ifcLoader.ifcManager.createSubset({
                        modelID: modelID,
                        ids: [expressID],
                        scene: scene,
                        removePrevious: true,
                        material: highlightMaterial
                    });

                    // Display info
                    const component = semanticData[globalId];
                    if (component) {
                        displayComponentInfo(globalId, expressID, component);
                    }

                    // Camera auto-focus disabled to keep model position stable
                    // Uncomment below to enable auto-focus on selected components
                    /*
                    const subset = ifcLoader.ifcManager.getSubset(modelID, highlightMaterial);
                    if (subset) {
                        const box = new THREE.Box3().setFromObject(subset);
                        const center = box.getCenter(new THREE.Vector3());
                        const size = box.getSize(new THREE.Vector3());

                        const maxDim = Math.max(size.x, size.y, size.z);
                        const fov = camera.fov * (Math.PI / 180);
                        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
                        cameraZ *= 2.5;

                        camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ);
                        camera.lookAt(center);
                        controls.target.copy(center);
                        controls.update();
                    }
                    */

                    console.log('✅ Highlighted component:', globalId);
                    break;
                }
            } catch (error) {
                // Skip elements that can't be accessed
                continue;
            }
        }

        if (!found) {
            console.warn('⚠️ Component not found in 3D model:', globalId);
            alert(`Component not found in 3D model.\nGlobalId: ${globalId}\n\nThe component may exist in semantic data but not in the IFC file.`);
        }
    } catch (error) {
        console.error('❌ Error highlighting component:', error);
        alert('Error highlighting component. Check console for details.');
    }
};

// Highlight multiple components by CorrectedID list (for timeline events)
window.highlightComponentsByCorrectedIDs = async function(correctedIDList) {
    if (!ifcLoader || !ifcModel) {
        console.warn('⚠️ IFC Model not loaded yet');
        alert('IFC Model is not loaded yet. Please wait.');
        return;
    }

    try {
        // Extract IDs from "CorrectedID_XXX" format (supports alphanumeric like 8B, 18A)
        const extractedIDs = correctedIDList.map(id => {
            const match = id.match(/CorrectedID_([A-Za-z0-9]+)/);
            return match ? match[1] : null;
        }).filter(id => id !== null);

        if (extractedIDs.length === 0) {
            console.warn('⚠️ No valid CorrectedIDs found');
            return;
        }

        console.log('🔍 Searching for components with CorrectedIDs:', extractedIDs);

        // Find GlobalIds from semantic data
        const globalIds = [];
        for (const [globalId, component] of Object.entries(semanticData)) {
            if (extractedIDs.includes(component.CorrectedID)) {
                globalIds.push(globalId);
            }
        }

        if (globalIds.length === 0) {
            console.warn('⚠️ No components found in semantic data for these CorrectedIDs');
            alert('No matching components found in the model.');
            return;
        }

        console.log(`📊 Found ${globalIds.length} components to highlight`);

        // Get all ExpressIDs from spatial structure
        const modelID = 0;
        let allIDs = [];

        try {
            const properties = await ifcLoader.ifcManager.getSpatialStructure(modelID);

            function collectIDs(element) {
                const ids = [];
                if (element.expressID !== undefined) {
                    ids.push(element.expressID);
                }
                if (element.children) {
                    element.children.forEach(child => {
                        ids.push(...collectIDs(child));
                    });
                }
                return ids;
            }

            allIDs = collectIDs(properties);
        } catch (error) {
            console.warn('Could not get spatial structure:', error);
            const maxID = 10000;
            for (let i = 1; i < maxID; i++) {
                allIDs.push(i);
            }
        }

        // Find ExpressIDs for all GlobalIds
        const expressIDsToHighlight = [];
        const foundGlobalIds = [];

        for (const expressID of allIDs) {
            try {
                const props = await ifcLoader.ifcManager.getItemProperties(modelID, expressID);

                if (props && props.GlobalId && globalIds.includes(props.GlobalId.value)) {
                    expressIDsToHighlight.push(expressID);
                    foundGlobalIds.push(props.GlobalId.value);

                    // Early exit if we found all
                    if (foundGlobalIds.length === globalIds.length) {
                        break;
                    }
                }
            } catch (error) {
                continue;
            }
        }

        if (expressIDsToHighlight.length === 0) {
            console.warn('⚠️ No components found in 3D model');
            alert('Components exist in semantic data but not found in 3D model.');
            return;
        }

        // Remove old timeline highlight
        ifcLoader.ifcManager.removeSubset(modelID, timelineHighlightMaterial);

        // Create new highlight for all components
        ifcLoader.ifcManager.createSubset({
            modelID: modelID,
            ids: expressIDsToHighlight,
            scene: scene,
            removePrevious: true,
            material: timelineHighlightMaterial
        });

        console.log(`✅ Highlighted ${expressIDsToHighlight.length} components (yellow)`);

        // Show info panel with first component
        if (foundGlobalIds.length > 0) {
            const firstGlobalId = foundGlobalIds[0];
            const component = semanticData[firstGlobalId];
            if (component) {
                displayComponentInfo(firstGlobalId, expressIDsToHighlight[0], component);
            }
        }

    } catch (error) {
        console.error('❌ Error highlighting timeline components:', error);
    }
};

// Clear timeline highlight
window.clearTimelineHighlight = function() {
    if (ifcLoader) {
        ifcLoader.ifcManager.removeSubset(0, timelineHighlightMaterial);
        console.log('🧹 Timeline highlight cleared');
    }
};

// Initialize
async function init() {
    try {
        console.log('🚀 Initializing HBIM Semantic Viewer...');
        
        await ifcLoader.ifcManager.applyWebIfcConfig({
            COORDINATE_TO_ORIGIN: true,
            USE_FAST_BOOLS: true
        });
        
        setupImageModal();
        await loadSemanticData();
        populateFilters(); // Populate query panel dropdowns
        await loadIFCModel();
        await applyNoSemanticMaterial(); // Apply transparent material to components without semantic data
        await loadTimeline(); // Load historical timeline

        // Start with collapsed panels
        document.getElementById('query-panel').classList.add('collapsed');

        updateProgress(100, 'Loading complete!');
        
        setTimeout(() => {
            document.getElementById('loading').classList.add('hidden');
            console.log('✅ System ready');
            console.log('💡 Double-click any component to view information');
        }, 500);
        
    } catch (error) {
        console.error('❌ Initialization failed:', error);
        alert('Failed to initialize viewer. Check console for details.');
    }
}

// Render loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Timeline Functions
window.toggleTimeline = function() {
    const panel = document.getElementById('timeline-panel');
    panel.classList.toggle('collapsed');
};

// Query Panel Toggle
window.toggleQueryPanel = function() {
    const panel = document.getElementById('query-panel');
    panel.classList.toggle('collapsed');
};

async function loadTimeline() {
    try {
        const response = await fetch('./timeline_data.json');
        const data = await response.json();

        const timelineScroll = document.getElementById('timeline-scroll');
        const dateRange = document.getElementById('timeline-date-range');

        // Update date range in header (if element exists)
        if (dateRange && data.metadata && data.metadata.date_range) {
            dateRange.textContent = `${data.metadata.date_range.min} - ${data.metadata.date_range.max}`;
        }

        // Sort events by date
        const sortedEvents = [...data.events].sort((a, b) => {
            const dateA = a.date.start || a.date.end || 0;
            const dateB = b.date.start || b.date.end || 0;
            return dateA - dateB;
        });

        // Create timeline track
        const track = document.createElement('div');
        track.className = 'timeline-track';

        // Render each event
        sortedEvents.forEach(event => {
            const eventCard = document.createElement('div');

            // Determine event type
            const hasDamages = event.damages && event.damages.length > 0;
            const hasRepairs = event.repairs && event.repairs.length > 0;
            let eventType = 'repair-event';
            let badgeType = 'repair';
            let badgeText = 'REPAIR';

            if (hasDamages && hasRepairs) {
                eventType = 'mixed-event';
                badgeType = 'mixed';
                badgeText = 'DAMAGE & REPAIR';
            } else if (hasDamages) {
                eventType = 'damage-event';
                badgeType = 'damage';
                badgeText = 'DAMAGE';
            }

            eventCard.className = `timeline-event ${eventType}`;

            // Format date display
            let dateDisplay = '';
            if (event.date.type === 'range') {
                dateDisplay = `${event.date.start}-${event.date.end}`;
            } else if (event.date.type === 'ongoing') {
                dateDisplay = `${event.date.start}+`;
            } else {
                dateDisplay = event.date.start || event.date.end || 'Unknown';
            }

            // Collect all components, descriptions, and affected_components
            const allComponents = new Set();
            const allAffectedComponents = new Set();
            let mainDescription = '';

            // Check event-level affected_components first (for events without damages/repairs structure)
            if (event.affected_components) {
                event.affected_components.forEach(comp => allAffectedComponents.add(comp));
            }

            // Check event-level description
            if (event.description) {
                mainDescription = event.description;
            }

            // Then check damages and repairs arrays
            [...(event.damages || []), ...(event.repairs || [])].forEach(item => {
                if (item.description && !mainDescription) {
                    mainDescription = item.description;
                }
                if (item.components) {
                    item.components.forEach(comp => allComponents.add(comp));
                }
                // Also collect affected_components inside damages/repairs
                if (item.affected_components) {
                    item.affected_components.forEach(comp => allAffectedComponents.add(comp));
                }
            });

            // Check if event has linked components (CorrectedID_XXX format from affected_components)
            const linkedComponents = Array.from(allAffectedComponents).filter(comp => comp.startsWith('CorrectedID_'));
            const hasLinkedComponents = linkedComponents.length > 0;

            // Build event card HTML
            let html = `
                <div class="event-date-row">
                    <div class="event-date">${dateDisplay}</div>
                    ${hasLinkedComponents ? '<span class="showcomp-badge" title="Click to highlight components">SHOW 3D</span>' : ''}
                </div>
                <div class="event-type-badge ${badgeType}">${badgeText}</div>
                <div class="event-label">${event.label}</div>
            `;

            if (allComponents.size > 0 || linkedComponents.length > 0) {
                html += '<div class="event-components">';
                // Show general component names (like "Dachstuhl")
                allComponents.forEach(comp => {
                    html += `<span class="component-tag">${comp}</span>`;
                });
                // Show count of linked IFC components
                if (linkedComponents.length > 0) {
                    html += `<span class="component-tag linked-count">${linkedComponents.length} IFC Components</span>`;
                }
                html += '</div>';
            }

            if (mainDescription) {
                html += `<div class="event-description">${mainDescription}</div>`;
            }

            eventCard.innerHTML = html;

            // Add click event for highlighting components
            if (hasLinkedComponents) {
                eventCard.classList.add('has-linked-components');
                eventCard.addEventListener('click', () => {
                    // Remove active state from other cards
                    document.querySelectorAll('.timeline-event.active').forEach(card => {
                        card.classList.remove('active');
                    });
                    // Add active state to this card
                    eventCard.classList.add('active');
                    // Highlight components in 3D viewer
                    window.highlightComponentsByCorrectedIDs(linkedComponents);
                });
            }

            track.appendChild(eventCard);
        });

        timelineScroll.innerHTML = '';
        timelineScroll.appendChild(track);

        // Start collapsed
        document.getElementById('timeline-panel').classList.add('collapsed');

        console.log('✅ Timeline loaded:', data.metadata.total_events, 'events');

    } catch (error) {
        console.error('❌ Error loading timeline:', error);
    }
}

// Responsive
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start
init();
animate();