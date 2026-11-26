// Start homepage 3D while the fallback artwork remains visible.
const start = document.querySelector('#start-scene');
const status = document.querySelector('#scene-status');
let loading;

function startScene() {
  if (loading) return;
  start.disabled = true;
  start.textContent = 'Loading 3D…';
  status.textContent = 'Loading the interactive mascot…';

  loading = import('./scene.js?v=homepage-3d-2').then(() => {
    start.hidden = true;
  }).catch(error => {
    console.error('Interactive mascot unavailable', error);
    status.textContent = '3D unavailable on this device. Showing artwork.';
    start.hidden = true;
  });
}

start.addEventListener('click', startScene);
if (!navigator.connection?.saveData) startScene();
