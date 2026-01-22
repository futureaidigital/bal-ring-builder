export default function Ring3D() {
  return (
    <html>
      <head>
        <title>Emerald Ring 3D Viewer</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style={{ margin: 0, padding: "20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#f5f5f5" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", background: "white", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
          <h1 style={{ margin: "0 0 20px 0", fontSize: "24px", fontWeight: 600, color: "#333" }}>Emerald Ring 3D Viewer</h1>
          
          <div id="status" style={{ 
            padding: "15px", 
            background: "#e3f2fd", 
            borderRadius: "4px",
            marginBottom: "20px",
            transition: "all 0.3s ease",
            fontSize: "14px",
            fontWeight: 500,
            color: "#1976d2"
          }}>
            Initializing 3D viewer...
          </div>
          
          <div style={{ marginTop: "20px", position: "relative" }}>
            <canvas id="canvas" style={{ 
              width: "100%", 
              height: "600px",
              display: "block",
              background: "#f0f0f0",
              borderRadius: "4px"
            }}></canvas>
            
            <div id="controls" style={{
              position: "absolute",
              bottom: "20px",
              left: "20px",
              background: "rgba(255,255,255,0.95)",
              padding: "15px",
              borderRadius: "8px",
              fontSize: "14px",
              boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
              backdropFilter: "blur(10px)"
            }}>
              <strong>Controls:</strong><br/>
              • Left drag: Rotate<br/>
              • Right drag: Pan<br/>
              • Scroll: Zoom<br/>
              • Double-click: Reset view
            </div>
            
            <div id="materials" style={{
              position: "absolute",
              bottom: "20px",
              right: "20px",
              background: "rgba(255,255,255,0.95)",
              padding: "15px",
              borderRadius: "8px",
              fontSize: "14px",
              boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
              backdropFilter: "blur(10px)",
              maxWidth: "250px",
              display: "none"
            }}>
              <strong>Detected Materials:</strong>
              <ul id="materialsList" style={{ listStyle: "none", padding: "5px 0 0 0", margin: 0 }}></ul>
            </div>
          </div>
        </div>
        
        <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/rhino3dm@8.0.1/rhino3dm.min.js"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                'use strict';
                
                const RING_URL = "https://cdn.shopify.com/s/files/1/0662/5689/6135/files/Bague_Alienor_Emeraude_L.3dm?v=1749967015";
                
                const statusEl = document.getElementById('status');
                const canvas = document.getElementById('canvas');
                const materialsDiv = document.getElementById('materials');
                const materialsList = document.getElementById('materialsList');
                
                let scene, camera, renderer, controls;
                let animationId = null;
                let rhino = null;
                
                function updateStatus(message, isError = false) {
                  statusEl.textContent = message;
                  statusEl.style.background = isError ? '#ffebee' : '#e3f2fd';
                  statusEl.style.color = isError ? '#c62828' : '#1976d2';
                  console.log('[Ring3D]', message);
                }
                
                function waitForDependencies() {
                  return new Promise((resolve, reject) => {
                    let attempts = 0;
                    const maxAttempts = 50;
                    
                    const checkDeps = () => {
                      attempts++;
                      
                      if (window.THREE && window.THREE.OrbitControls && window.rhino3dm) {
                        resolve();
                      } else if (attempts >= maxAttempts) {
                        reject(new Error('Failed to load dependencies'));
                      } else {
                        setTimeout(checkDeps, 100);
                      }
                    };
                    
                    checkDeps();
                  });
                }
                
                function isValidNumber(num) {
                  return typeof num === 'number' && !isNaN(num) && isFinite(num);
                }
                
                function validateVertex(vertex) {
                  // Handle different vertex formats from rhino3dm
                  if (!vertex) return null;
                  
                  let x, y, z;
                  
                  // Check if vertex is an object with x, y, z properties
                  if (typeof vertex === 'object' && 'x' in vertex && 'y' in vertex && 'z' in vertex) {
                    x = vertex.x;
                    y = vertex.y;
                    z = vertex.z;
                  }
                  // Check if vertex is an array
                  else if (Array.isArray(vertex) && vertex.length >= 3) {
                    x = vertex[0];
                    y = vertex[1];
                    z = vertex[2];
                  }
                  // Check if vertex is a Point3d object with X, Y, Z (uppercase)
                  else if (typeof vertex === 'object' && 'X' in vertex && 'Y' in vertex && 'Z' in vertex) {
                    x = vertex.X;
                    y = vertex.Y;
                    z = vertex.Z;
                  }
                  // Try to get coordinates via method calls
                  else if (typeof vertex.get === 'function') {
                    try {
                      x = vertex.get(0);
                      y = vertex.get(1);
                      z = vertex.get(2);
                    } catch (e) {
                      return null;
                    }
                  }
                  else {
                    return null;
                  }
                  
                  if (!isValidNumber(x) || !isValidNumber(y) || !isValidNumber(z)) {
                    return null;
                  }
                  return [x, y, z];
                }
                
                function processMesh(mesh, material, meshIndex) {
                  try {
                    const verts = mesh.vertices();
                    const faces = mesh.faces();
                    
                    if (!verts || verts.count === 0 || !faces || faces.count === 0) {
                      console.warn('Mesh ' + meshIndex + ' has no vertices or faces');
                      return null;
                    }
                    
                    console.log('Processing mesh ' + meshIndex + ', vertices: ' + verts.count + ', faces: ' + faces.count);
                    
                    // Debug mesh structure
                    if (meshIndex === '0_0') {
                      console.log('Mesh object:', mesh);
                      console.log('Mesh methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(mesh)).filter(m => typeof mesh[m] === 'function'));
                      console.log('Vertices object:', verts);
                      console.log('Faces object:', faces);
                    }
                    
                    // Create geometry
                    const geometry = new THREE.BufferGeometry();
                    const positions = [];
                    const normalArray = [];
                    let invalidVertexCount = 0;
                    
                    // Debug first vertex
                    if (verts.count > 0) {
                      const firstVertex = verts.get(0);
                      console.log('First vertex format:', {
                        value: firstVertex,
                        type: typeof firstVertex,
                        isArray: Array.isArray(firstVertex),
                        props: firstVertex ? Object.keys(firstVertex) : null
                      });
                    }
                    
                    // Process vertices
                    for (let v = 0; v < verts.count; v++) {
                      const pt = verts.get(v);
                      const validVertex = validateVertex(pt);
                      
                      if (validVertex) {
                        positions.push(validVertex[0], validVertex[1], validVertex[2]);
                      } else {
                        // Log first few invalid vertices for debugging
                        if (invalidVertexCount < 3) {
                          console.log('Invalid vertex at index ' + v + ':', pt);
                        }
                        invalidVertexCount++;
                        // Use origin as fallback for invalid vertices
                        positions.push(0, 0, 0);
                      }
                    }
                    
                    if (invalidVertexCount > 0) {
                      console.warn('Mesh ' + meshIndex + ' has ' + invalidVertexCount + ' invalid vertices');
                    }
                    
                    // Check if we have valid vertex data
                    if (positions.length === 0 || positions.every(v => v === 0)) {
                      console.error('Mesh ' + meshIndex + ' has no valid vertex positions');
                      return null;
                    }
                    
                    // Process normals if available
                    const normals = mesh.normals ? mesh.normals() : null;
                    if (normals && normals.count && normals.count > 0) {
                      for (let n = 0; n < normals.count; n++) {
                        const normal = normals.get(n);
                        if (normal && normal.length >= 3) {
                          normalArray.push(
                            isValidNumber(normal[0]) ? normal[0] : 0,
                            isValidNumber(normal[1]) ? normal[1] : 0,
                            isValidNumber(normal[2]) ? normal[2] : 1
                          );
                        } else {
                          normalArray.push(0, 0, 1);
                        }
                      }
                    }
                    
                    // Process faces
                    const indices = [];
                    let invalidFaceCount = 0;
                    
                    // Debug first face
                    if (faces.count > 0) {
                      const firstFace = faces.get(0);
                      console.log('First face format:', {
                        value: firstFace,
                        type: typeof firstFace,
                        isArray: Array.isArray(firstFace),
                        props: firstFace ? Object.keys(firstFace) : null
                      });
                    }
                    
                    for (let f = 0; f < faces.count; f++) {
                      const face = faces.get(f);
                      
                      if (!face) {
                        invalidFaceCount++;
                        continue;
                      }
                      
                      // Handle different face formats
                      let i0, i1, i2, i3;
                      
                      if (Array.isArray(face) && face.length >= 3) {
                        i0 = face[0];
                        i1 = face[1];
                        i2 = face[2];
                        i3 = face.length > 3 ? face[3] : face[2];
                      } else if (typeof face === 'object') {
                        // Try different property names
                        if ('a' in face && 'b' in face && 'c' in face) {
                          i0 = face.a;
                          i1 = face.b;
                          i2 = face.c;
                          i3 = face.d !== undefined ? face.d : face.c;
                        } else if ('A' in face && 'B' in face && 'C' in face) {
                          i0 = face.A;
                          i1 = face.B;
                          i2 = face.C;
                          i3 = face.D !== undefined ? face.D : face.C;
                        } else if (typeof face.get === 'function') {
                          try {
                            i0 = face.get(0);
                            i1 = face.get(1);
                            i2 = face.get(2);
                            i3 = face.get(3) !== undefined ? face.get(3) : face.get(2);
                          } catch (e) {
                            invalidFaceCount++;
                            continue;
                          }
                        } else {
                          // Log first invalid face for debugging
                          if (invalidFaceCount === 0) {
                            console.log('Invalid face format at index ' + f + ':', face);
                          }
                          invalidFaceCount++;
                          continue;
                        }
                      } else {
                        invalidFaceCount++;
                        continue;
                      }
                      
                      // Validate face indices
                      if (isValidNumber(i0) && isValidNumber(i1) && isValidNumber(i2) &&
                          i0 >= 0 && i1 >= 0 && i2 >= 0 &&
                          i0 < verts.count && i1 < verts.count && i2 < verts.count) {
                        indices.push(i0, i1, i2);
                        
                        // Add second triangle for quads
                        if (i2 !== i3 && isValidNumber(i3) && i3 >= 0 && i3 < verts.count) {
                          indices.push(i0, i2, i3);
                        }
                      } else {
                        invalidFaceCount++;
                      }
                    }
                    
                    if (invalidFaceCount > 0) {
                      console.warn('Mesh ' + meshIndex + ' has ' + invalidFaceCount + ' invalid faces');
                    }
                    
                    if (indices.length === 0) {
                      console.error('Mesh ' + meshIndex + ' has no valid faces');
                      return null;
                    }
                    
                    // Set geometry attributes
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                    
                    if (normalArray.length > 0) {
                      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalArray, 3));
                    } else {
                      geometry.computeVertexNormals();
                    }
                    
                    geometry.setIndex(indices);
                    
                    // Compute bounds safely
                    try {
                      geometry.computeBoundingBox();
                      geometry.computeBoundingSphere();
                    } catch (boundsError) {
                      console.warn('Failed to compute bounds for mesh ' + meshIndex, boundsError);
                    }
                    
                    const threeMesh = new THREE.Mesh(geometry, material);
                    threeMesh.castShadow = true;
                    threeMesh.receiveShadow = true;
                    
                    return threeMesh;
                    
                  } catch (error) {
                    console.error('Error processing mesh ' + meshIndex + ':', error);
                    return null;
                  }
                }
                
                function createMaterial(rhinoMat, matIndex) {
                  let material;
                  
                  if (rhinoMat) {
                    const matName = (rhinoMat.name || '').toLowerCase();
                    console.log('Creating material for: ' + matName);
                    
                    if (matName.includes('emerald') || matName.includes('emeraude') || 
                        matName.includes('émeraude') || matName.includes('vert')) {
                      // Emerald material
                      material = new THREE.MeshPhysicalMaterial({
                        color: 0x50C878,
                        metalness: 0,
                        roughness: 0.05,
                        transmission: 0.9,
                        ior: 1.57,
                        clearcoat: 1,
                        clearcoatRoughness: 0,
                        reflectivity: 0.5
                      });
                    } else if (matName.includes('diamond') || matName.includes('diamant')) {
                      // Diamond material
                      material = new THREE.MeshPhysicalMaterial({
                        color: 0xffffff,
                        metalness: 0,
                        roughness: 0,
                        transmission: 1,
                        ior: 2.42,
                        clearcoat: 1,
                        clearcoatRoughness: 0,
                        reflectivity: 1
                      });
                    } else if (matName.includes('gold') || matName.includes('or') || 
                               matName.includes('yellow') || matName.includes('jaune')) {
                      // Gold material
                      material = new THREE.MeshPhysicalMaterial({
                        color: 0xFFD700,
                        metalness: 1,
                        roughness: 0.15,
                        clearcoat: 0.1,
                        clearcoatRoughness: 0.1,
                        reflectivity: 0.9
                      });
                    } else if (matName.includes('silver') || matName.includes('argent') || 
                               matName.includes('white') || matName.includes('blanc') ||
                               matName.includes('metal')) {
                      // Silver/White gold material
                      material = new THREE.MeshPhysicalMaterial({
                        color: 0xC0C0C0,
                        metalness: 1,
                        roughness: 0.1,
                        clearcoat: 0.1,
                        clearcoatRoughness: 0.1,
                        reflectivity: 0.95
                      });
                    } else {
                      // Default material based on rhino material properties
                      const c = rhinoMat.diffuseColor || {r: 128, g: 128, b: 128};
                      material = new THREE.MeshPhysicalMaterial({
                        color: new THREE.Color(c.r/255, c.g/255, c.b/255),
                        metalness: rhinoMat.metallic || 0.5,
                        roughness: Math.max(0.05, 1 - ((rhinoMat.shine || 0) / 255)),
                        clearcoat: rhinoMat.transparency > 0 ? 1 : 0
                      });
                    }
                  } else {
                    // Fallback material
                    material = new THREE.MeshStandardMaterial({ 
                      color: 0x808080,
                      metalness: 0.5,
                      roughness: 0.5
                    });
                  }
                  
                  return material;
                }
                
                async function initializeViewer() {
                  try {
                    updateStatus('Loading 3D libraries...');
                    
                    // Wait for all dependencies
                    await waitForDependencies();
                    
                    // Initialize rhino3dm
                    rhino = await rhino3dm();
                    updateStatus('Libraries loaded! Setting up 3D scene...');
                    
                    // Setup Three.js
                    scene = new THREE.Scene();
                    scene.background = new THREE.Color(0xf8f8f8);
                    
                    // Camera
                    camera = new THREE.PerspectiveCamera(
                      45,
                      canvas.clientWidth / canvas.clientHeight,
                      0.1,
                      1000
                    );
                    camera.position.set(50, 50, 100);
                    
                    // Renderer
                    renderer = new THREE.WebGLRenderer({ 
                      canvas: canvas, 
                      antialias: true,
                      alpha: true,
                      powerPreference: "high-performance"
                    });
                    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
                    renderer.shadowMap.enabled = true;
                    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                    renderer.toneMapping = THREE.ACESFilmicToneMapping;
                    renderer.toneMappingExposure = 1.2;
                    renderer.outputEncoding = THREE.sRGBEncoding;
                    
                    // Controls
                    controls = new THREE.OrbitControls(camera, renderer.domElement);
                    controls.enableDamping = true;
                    controls.dampingFactor = 0.05;
                    controls.minDistance = 20;
                    controls.maxDistance = 200;
                    controls.enablePan = true;
                    controls.autoRotate = true;
                    controls.autoRotateSpeed = 0.5;
                    
                    // Double-click to reset
                    renderer.domElement.addEventListener('dblclick', () => {
                      controls.reset();
                    });
                    
                    // Professional jewelry lighting
                    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
                    scene.add(ambientLight);
                    
                    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
                    keyLight.position.set(5, 10, 5);
                    keyLight.castShadow = true;
                    keyLight.shadow.mapSize.width = 2048;
                    keyLight.shadow.mapSize.height = 2048;
                    scene.add(keyLight);
                    
                    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
                    fillLight.position.set(-5, 5, -5);
                    scene.add(fillLight);
                    
                    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
                    rimLight.position.set(0, -10, -10);
                    scene.add(rimLight);
                    
                    const topLight = new THREE.DirectionalLight(0xffffff, 0.5);
                    topLight.position.set(0, 20, 0);
                    scene.add(topLight);
                    
                    // Animation loop
                    function animate() {
                      animationId = requestAnimationFrame(animate);
                      controls.update();
                      renderer.render(scene, camera);
                    }
                    animate();
                    
                    // Handle resize
                    function handleResize() {
                      camera.aspect = canvas.clientWidth / canvas.clientHeight;
                      camera.updateProjectionMatrix();
                      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
                    }
                    window.addEventListener('resize', handleResize);
                    
                    // Load the ring
                    updateStatus('Downloading ring model...');
                    
                    const response = await fetch(RING_URL);
                    if (!response.ok) {
                      throw new Error('Failed to download: ' + response.status);
                    }
                    
                    const buffer = await response.arrayBuffer();
                    const arr = new Uint8Array(buffer);
                    updateStatus('Processing 3DM file (' + (arr.length / 1024 / 1024).toFixed(2) + ' MB)...');
                    
                    // Parse 3dm
                    const doc = rhino.File3dm.fromByteArray(arr);
                    if (!doc) {
                      throw new Error('Failed to parse 3DM file');
                    }
                    
                    const objects = doc.objects();
                    const materials = doc.materials();
                    
                    updateStatus('Building 3D model (' + objects.count + ' objects)...');
                    
                    // Show materials
                    if (materials.count > 0) {
                      materialsDiv.style.display = 'block';
                    }
                    
                    // Process materials
                    const materialMap = new Map();
                    for (let i = 0; i < materials.count; i++) {
                      const mat = materials.get(i);
                      const matName = mat.name || 'Material ' + i;
                      console.log('Material ' + i + ':', matName);
                      const li = document.createElement('li');
                      li.textContent = matName;
                      li.style.padding = '2px 0';
                      materialsList.appendChild(li);
                      materialMap.set(i, mat);
                    }
                    
                    // Process objects
                    let meshCount = 0;
                    let instanceCount = 0;
                    let errorCount = 0;
                    const meshGroup = new THREE.Group();
                    const instanceRefs = [];
                    const processedGeometries = new Map();
                    const instanceDefinitions = new Map();
                    
                    // First pass: process all geometry objects
                    for (let i = 0; i < objects.count; i++) {
                      const obj = objects.get(i);
                      const attrs = obj.attributes();
                      
                      if (attrs.isVisible === false) continue;
                      
                      // First check if object has render mesh
                      let geom = obj.geometry();
                      
                      // Check for render mesh first
                      const renderMesh = obj.renderMesh ? obj.renderMesh() : null;
                      if (renderMesh) {
                        console.log('Object ' + i + ' has render mesh');
                        geom = renderMesh;
                      }
                      
                      if (!geom) {
                        console.log('Object ' + i + ' has no geometry');
                        continue;
                      }
                      
                      const className = geom.constructor ? geom.constructor.name : 'Unknown';
                      console.log('Object ' + i + ': ' + className);
                      
                      // Handle different geometry types
                      if (className === 'InstanceReference') {
                        instanceRefs.push({obj, attrs, index: i});
                        instanceCount++;
                      } else if (className === 'Brep') {
                        // Handle Brep (Boundary Representation) objects
                        try {
                          console.log('Processing Brep object ' + i);
                          
                          // Debug: List available methods
                          if (i === 0) {
                            console.log('Brep methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(geom)).filter(m => typeof geom[m] === 'function'));
                            console.log('Object methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).filter(m => typeof obj[m] === 'function'));
                          }
                          
                          // Try simple conversion first
                          let meshArray = null;
                          
                          // Method 1: Check if object has render meshes
                          if (attrs && attrs.renderMeshes) {
                            try {
                              console.log('Found renderMeshes in attributes');
                              meshArray = attrs.renderMeshes;
                              if (!Array.isArray(meshArray)) {
                                meshArray = [meshArray];
                              }
                              console.log('Method 1 successful: got ' + meshArray.length + ' render meshes');
                            } catch (e1) {
                              console.log('Method 1 failed:', e1.message);
                            }
                          }
                          
                          // Method 2: Try to get meshes from faces
                          if (!meshArray && geom.faces) {
                            try {
                              console.log('Attempting to get meshes from Brep');
                              
                              // Try different mesh extraction methods
                              if (typeof geom.getMesh === 'function') {
                                const mesh = geom.getMesh();
                                if (mesh) {
                                  meshArray = [mesh];
                                  console.log('Method 2a: Got mesh using getMesh()');
                                }
                              }
                              
                              // Try to get display mesh
                              if (!meshArray && typeof geom.displayMesh === 'function') {
                                const mesh = geom.displayMesh();
                                if (mesh) {
                                  meshArray = [mesh];
                                  console.log('Method 2b: Got display mesh');
                                }
                              }
                              
                              // Try face-by-face mesh extraction
                              if (!meshArray) {
                                const faces = geom.faces();
                                console.log('Brep has ' + faces.count + ' faces');
                                const meshes = [];
                                
                                for (let f = 0; f < faces.count && f < 10; f++) { // Limit to first 10 faces for performance
                                  const face = faces.get(f);
                                  if (face && typeof face.getMesh === 'function') {
                                    try {
                                      const faceMesh = face.getMesh();
                                      if (faceMesh) {
                                        meshes.push(faceMesh);
                                      }
                                    } catch (faceErr) {
                                      // Skip this face
                                    }
                                  }
                                }
                                
                                if (meshes.length > 0) {
                                  meshArray = meshes;
                                  console.log('Method 2c: Got ' + meshes.length + ' face meshes');
                                }
                              }
                              
                              // If still no mesh, log available methods for debugging
                              if (!meshArray) {
                                console.log('No mesh extraction method worked. Available Brep methods:', 
                                  Object.getOwnPropertyNames(Object.getPrototypeOf(geom)).filter(m => typeof geom[m] === 'function')
                                );
                              }
                            } catch (e2) {
                              console.log('Method 2 failed:', e2.message);
                            }
                          }
                          
                          // Method 3: Try object's mesh methods
                          if (!meshArray && obj) {
                            try {
                              console.log('Attempting to get mesh from object methods');
                              
                              // Check if object has getMeshes method
                              if (typeof obj.getMeshes === 'function') {
                                const meshes = obj.getMeshes();
                                if (meshes) {
                                  meshArray = Array.isArray(meshes) ? meshes : [meshes];
                                  console.log('Method 3a: Got meshes from object.getMeshes()');
                                }
                              }
                              
                              // Check if object has mesh property
                              if (!meshArray && obj.mesh) {
                                meshArray = [obj.mesh];
                                console.log('Method 3b: Got mesh from object.mesh property');
                              }
                              
                              // Try to create mesh with default parameters
                              if (!meshArray && rhino.Mesh && geom) {
                                try {
                                  // Create an empty mesh and try to populate it
                                  const mesh = new rhino.Mesh();
                                  
                                  // If Brep has vertices, add them
                                  if (geom.vertices) {
                                    const vertices = geom.vertices();
                                    for (let v = 0; v < vertices.count && v < 100; v++) { // Limit for performance
                                      const vertex = vertices.get(v);
                                      if (vertex && vertex.location) {
                                        mesh.vertices().add(vertex.location.x, vertex.location.y, vertex.location.z);
                                      }
                                    }
                                    
                                    // Add some basic faces if we have enough vertices
                                    if (mesh.vertices().count >= 3) {
                                      // Try to add faces using the correct API
                                      const faceList = mesh.faces();
                                      if (faceList && typeof faceList.add === 'function') {
                                        // Create triangular faces
                                        for (let i = 0; i < mesh.vertices().count - 2; i += 3) {
                                          try {
                                            faceList.add(i, i + 1, i + 2);
                                          } catch (e) {
                                            // Skip if face can't be added
                                          }
                                        }
                                      }
                                      meshArray = [mesh];
                                      console.log('Method 3c: Created basic triangulated mesh');
                                    }
                                  }
                                } catch (meshErr) {
                                  console.log('Failed to create basic mesh:', meshErr.message);
                                }
                              }
                            } catch (e3) {
                              console.log('Method 3 failed:', e3.message);
                            }
                          }
                          
                          // Method 4: Provide helpful message
                          if (!meshArray) {
                            console.log('This 3DM file contains BREP objects without render meshes.');
                            console.log('To view this file properly, please:');
                            console.log('1. Open the file in Rhino');
                            console.log('2. Select all objects');
                            console.log('3. Run command: ExtractRenderMesh');
                            console.log('4. Save the file and re-upload');
                          }
                          
                          // Method 5: For now, skip Breps and process only mesh objects
                          if (!meshArray) {
                            console.log('Skipping Brep object ' + i + ' - no mesh conversion available');
                            if (i === 0) { // Only show this message once
                              updateStatus('Note: This 3DM file contains BREP geometry. For best results, export with render meshes from Rhino.', true);
                            }
                          }
                          
                          // Process the meshes
                          if (meshArray && meshArray.length > 0) {
                            for (let m = 0; m < meshArray.length; m++) {
                              const mesh = meshArray[m];
                              if (mesh) {
                                const matIndex = attrs.materialIndex;
                                const rhinoMat = materialMap.get(matIndex);
                                const material = createMaterial(rhinoMat, matIndex);
                                
                                const threeMesh = processMesh(mesh, material, i + '_' + m);
                                if (threeMesh) {
                                  meshGroup.add(threeMesh);
                                  meshCount++;
                                  // Store for instance references
                                  if (attrs.id) {
                                    processedGeometries.set(attrs.id, threeMesh);
                                  }
                                } else {
                                  errorCount++;
                                }
                                
                                // Clean up mesh if it has a delete method
                                if (typeof mesh.delete === 'function') {
                                  try {
                                    mesh.delete();
                                  } catch (delError) {
                                    console.warn('Failed to delete mesh:', delError);
                                  }
                                }
                              }
                            }
                          } else {
                            console.warn('No meshes could be generated from Brep ' + i);
                            errorCount++;
                          }
                        } catch (brepError) {
                          console.error('Failed to process Brep ' + i + ':', brepError);
                          errorCount++;
                        }
                      } else if (geom && typeof geom.vertices === 'function' && typeof geom.faces === 'function') {
                        // It's a mesh-like object
                        const matIndex = attrs.materialIndex;
                        const rhinoMat = materialMap.get(matIndex);
                        const material = createMaterial(rhinoMat, matIndex);
                        
                        const mesh = processMesh(geom, material, i);
                        if (mesh) {
                          meshGroup.add(mesh);
                          processedGeometries.set(attrs.id, mesh);
                          meshCount++;
                        } else {
                          errorCount++;
                        }
                      } else if (geom.toThreejsJSON) {
                        // Try to convert to Three.js format
                        try {
                          const loader = new THREE.ObjectLoader();
                          const threeObj = loader.parse(geom.toThreejsJSON());
                          if (threeObj) {
                            meshGroup.add(threeObj);
                            processedGeometries.set(attrs.id, threeObj);
                            meshCount++;
                          }
                        } catch (convError) {
                          console.warn('Failed to convert object ' + i + ' to Three.js format:', convError);
                          errorCount++;
                        }
                      } else {
                        console.log('Unknown geometry type for object ' + i + ':', {
                          className: className,
                          methods: Object.getOwnPropertyNames(Object.getPrototypeOf(geom)).filter(m => typeof geom[m] === 'function')
                        });
                      }
                      
                      // Clean up geometry
                      if (geom) {
                        try {
                          geom.delete();
                        } catch (deleteError) {
                          console.warn('Failed to delete geometry:', deleteError);
                        }
                      }
                    }
                    
                    // Second pass: process instance references
                    console.log('Processing ' + instanceRefs.length + ' instance references');
                    
                    // First, check if we have instance definitions
                    const instanceDefs = doc.instanceDefinitions ? doc.instanceDefinitions() : null;
                    if (instanceDefs && instanceDefs.count > 0) {
                      console.log('Found ' + instanceDefs.count + ' instance definitions');
                      for (let i = 0; i < instanceDefs.count; i++) {
                        const def = instanceDefs.get(i);
                        if (def && def.id) {
                          instanceDefinitions.set(def.id, def);
                        }
                      }
                    }
                    
                    for (const {obj, attrs, index} of instanceRefs) {
                      try {
                        const geom = obj.geometry();
                        
                        // Try to get instance definition
                        let parentId = null;
                        let xform = attrs.xform || attrs.transform;
                        
                        // Different ways to get instance info
                        if (geom) {
                          // Method 1: Direct property access
                          if (geom.parentIdefId !== undefined) {
                            parentId = geom.parentIdefId;
                          }
                          // Method 2: Method call
                          else if (typeof geom.parentIdefId === 'function') {
                            parentId = geom.parentIdefId();
                          }
                          // Method 3: Parent UUID
                          else if (geom.parentUuid) {
                            parentId = geom.parentUuid;
                          }
                          // Method 4: Definition ID
                          else if (geom.definitionId) {
                            parentId = geom.definitionId;
                          }
                        }
                        
                        // Check attributes as well
                        if (!parentId && attrs) {
                          if (attrs.parentId !== undefined) {
                            parentId = attrs.parentId;
                          } else if (attrs.instanceDefinitionId !== undefined) {
                            parentId = attrs.instanceDefinitionId;
                          }
                        }
                        
                        console.log('Instance ' + index + ' references parent: ' + parentId);
                        
                        // Create placeholder for all instances for now
                        if (xform) {
                          // Determine material based on instance index pattern
                          let material;
                          if (index >= 4 && index <= 26) {
                            // These are likely the gemstones based on the pattern
                            const gemIndex = (index - 4) % 3;
                            if (gemIndex === 0) {
                              // Diamond
                              material = new THREE.MeshPhysicalMaterial({
                                color: 0xffffff,
                                metalness: 0,
                                roughness: 0,
                                transmission: 1,
                                thickness: 0.5,
                                ior: 2.42,
                                clearcoat: 1,
                                clearcoatRoughness: 0
                              });
                            } else {
                              // Emerald
                              material = new THREE.MeshPhysicalMaterial({
                                color: 0x50C878,
                                metalness: 0,
                                roughness: 0.05,
                                transmission: 0.9,
                                thickness: 1,
                                ior: 1.57,
                                clearcoat: 1,
                                clearcoatRoughness: 0
                              });
                            }
                          } else {
                            // Default material
                            material = new THREE.MeshStandardMaterial({ 
                              color: 0xcccccc,
                              metalness: 0.5,
                              roughness: 0.5
                            });
                          }
                          
                          // Create a small sphere as placeholder for gems
                          const geometry = new THREE.SphereGeometry(0.5, 16, 16);
                          const placeholder = new THREE.Mesh(geometry, material);
                          
                          // Apply transformation
                          if (Array.isArray(xform) && xform.length >= 16) {
                            const matrix = new THREE.Matrix4();
                            matrix.set(
                              xform[0], xform[1], xform[2], xform[3],
                              xform[4], xform[5], xform[6], xform[7],
                              xform[8], xform[9], xform[10], xform[11],
                              xform[12], xform[13], xform[14], xform[15]
                            );
                            placeholder.applyMatrix4(matrix);
                          }
                          
                          meshGroup.add(placeholder);
                          meshCount++;
                        }
                        
                        if (geom) {
                          try {
                            geom.delete();
                          } catch (delError) {
                            // Ignore deletion errors
                          }
                        }
                      } catch (instError) {
                        console.warn('Failed to process instance ' + index + ':', instError);
                        errorCount++;
                      }
                    }
                    
                    // If no meshes were loaded, create a visualization based on the instances
                    if (meshCount === 0 && instanceRefs.length > 0) {
                      console.log('No meshes loaded, but found instances. Creating visualization from instance data...');
                      
                      // Create a ring band as base
                      const ringGeometry = new THREE.TorusGeometry(10, 2, 8, 50);
                      const ringMaterial = new THREE.MeshPhysicalMaterial({
                        color: 0xC0C0C0,
                        metalness: 1,
                        roughness: 0.1,
                        clearcoat: 0.1,
                        clearcoatRoughness: 0.1,
                        reflectivity: 0.95
                      });
                      const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
                      ringMesh.rotation.x = Math.PI / 2;
                      meshGroup.add(ringMesh);
                      meshCount = 1;
                      
                      updateStatus('Created placeholder ring visualization. For accurate model, export with render meshes from Rhino.', true);
                    } else if (meshCount === 0) {
                      console.log('No meshes loaded with standard methods. Trying alternate approaches...');
                      
                      // Try to get any object with geometry
                      let hasAnyGeometry = false;
                      for (let i = 0; i < objects.count; i++) {
                        const obj = objects.get(i);
                        const geom = obj.geometry();
                        if (geom) {
                          hasAnyGeometry = true;
                          
                          // Try to get bounding box from geometry
                          let bbox = null;
                          if (typeof geom.getBoundingBox === 'function') {
                            bbox = geom.getBoundingBox();
                          } else if (typeof geom.boundingBox === 'function') {
                            bbox = geom.boundingBox();
                          }
                          
                          if (bbox && bbox.min && bbox.max) {
                            const size = {
                              x: bbox.max.x - bbox.min.x,
                              y: bbox.max.y - bbox.min.y,
                              z: bbox.max.z - bbox.min.z
                            };
                            const center = {
                              x: (bbox.max.x + bbox.min.x) / 2,
                              y: (bbox.max.y + bbox.min.y) / 2,
                              z: (bbox.max.z + bbox.min.z) / 2
                            };
                            
                            // Create a box representation
                            const geometry = new THREE.BoxGeometry(
                              size.x || 10, 
                              size.y || 10, 
                              size.z || 10
                            );
                            const material = new THREE.MeshStandardMaterial({ 
                              color: 0x00ff00,
                              wireframe: true
                            });
                            const box = new THREE.Mesh(geometry, material);
                            box.position.set(center.x || 0, center.y || 0, center.z || 0);
                            meshGroup.add(box);
                            meshCount = 1;
                            
                            updateStatus('Warning: Showing bounding box only. File may need render meshes.', true);
                            break;
                          }
                          
                          geom.delete();
                        }
                      }
                      
                      if (!hasAnyGeometry || meshCount === 0) {
                        // Create a default placeholder
                        console.log('Creating default placeholder geometry');
                        const geometry = new THREE.RingGeometry(5, 15, 32);
                        const material = new THREE.MeshStandardMaterial({ 
                          color: 0xffff00,
                          metalness: 0.8,
                          roughness: 0.2
                        });
                        const ring = new THREE.Mesh(geometry, material);
                        meshGroup.add(ring);
                        meshCount = 1;
                        
                        updateStatus('Error: Could not extract geometry. Showing placeholder ring.', true);
                      }
                    }
                    
                    // Add to scene
                    scene.add(meshGroup);
                    
                    // Center and scale
                    const box = new THREE.Box3().setFromObject(meshGroup);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    
                    // Check for valid bounds
                    if (!isValidNumber(size.x) || !isValidNumber(size.y) || !isValidNumber(size.z)) {
                      console.warn('Invalid bounding box, using default camera position');
                      camera.position.set(100, 100, 100);
                      camera.lookAt(0, 0, 0);
                    } else {
                      meshGroup.position.sub(center);
                      
                      const maxDim = Math.max(size.x, size.y, size.z);
                      const fov = camera.fov * (Math.PI / 180);
                      const cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.5;
                      
                      camera.position.set(
                        cameraDistance * 0.5,
                        cameraDistance * 0.5,
                        cameraDistance
                      );
                      camera.lookAt(0, 0, 0);
                    }
                    
                    controls.target.set(0, 0, 0);
                    controls.update();
                    
                    // Stop auto-rotation after 5 seconds
                    setTimeout(() => {
                      if (controls) controls.autoRotate = false;
                    }, 5000);
                    
                    // Final status
                    let statusMessage = '';
                    if (meshCount > 0) {
                      statusMessage = 'Loaded ' + meshCount + ' objects';
                      if (instanceCount > 0) {
                        statusMessage += ' (' + instanceCount + ' instances visualized as placeholders)';
                      }
                      if (errorCount > 0) {
                        statusMessage += '. Some objects could not be loaded.';
                      }
                      statusMessage += '. Use mouse to interact.';
                      updateStatus(statusMessage);
                    } else {
                      statusMessage = 'This 3DM file contains BREP geometry without render meshes. ';
                      statusMessage += 'To view properly: Open in Rhino → Select all → Run "ExtractRenderMesh" → Save and re-upload.';
                      updateStatus(statusMessage, true);
                    }
                    
                    // Cleanup
                    try {
                      objects.delete();
                      materials.delete();
                      doc.delete();
                    } catch (cleanupError) {
                      console.warn('Cleanup error:', cleanupError);
                    }
                    
                  } catch (error) {
                    updateStatus('Error: ' + error.message, true);
                    console.error('[Ring3D] Error:', error);
                    
                    // Attempt to show a basic scene even on error
                    if (!scene) {
                      scene = new THREE.Scene();
                      scene.background = new THREE.Color(0xf8f8f8);
                    }
                    if (!camera) {
                      camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
                      camera.position.set(0, 0, 100);
                    }
                    if (!renderer) {
                      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
                      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
                    }
                    
                    // Add a placeholder object
                    const geometry = new THREE.BoxGeometry(20, 20, 20);
                    const material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
                    const cube = new THREE.Mesh(geometry, material);
                    scene.add(cube);
                    
                    function errorAnimate() {
                      animationId = requestAnimationFrame(errorAnimate);
                      if (cube) cube.rotation.y += 0.01;
                      renderer.render(scene, camera);
                    }
                    errorAnimate();
                  }
                }
                
                // Start initialization when page loads
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', initializeViewer);
                } else {
                  initializeViewer();
                }
                
                // Cleanup on page unload
                window.addEventListener('beforeunload', () => {
                  try {
                    if (animationId) cancelAnimationFrame(animationId);
                    if (controls) controls.dispose();
                    if (renderer) {
                      renderer.dispose();
                      renderer.forceContextLoss();
                    }
                  } catch (cleanupError) {
                    console.warn('Unload cleanup error:', cleanupError);
                  }
                });
              })();
            `
          }}
        />
      </body>
    </html>
  );
}