// Load the 3D scene near the viewport. Keep the artwork visible until each model renders.
const start = document.querySelector('#start-scene');
const status = document.querySelector('#scene-status');
let loading;
let observer;

function startScene() {
  if (loading) return;
  observer?.disconnect();
  start.disabled = true;
  start.textContent = 'Loading 3D…';
  status.textContent = 'Loading the interactive mascot…';

  loading = import('./scene.js?v=viewport-3d-1').then(() => {
    start.hidden = true;
  }).catch(error => {
    console.error('Interactive mascot unavailable', error);
    status.textContent = '3D unavailable on this device. Showing artwork.';
    start.hidden = true;
  });
}

start.addEventListener('click', startScene);
if (!navigator.connection?.saveData) {
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) startScene();
  }, {rootMargin: '120px'});
  observer.observe(document.querySelector('#scene'));
  observer.observe(document.querySelector('#logo-scene'));
}
