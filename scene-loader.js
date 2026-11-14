// Keep the page immediately usable; load the optional 3D experience on request.
const start = document.querySelector('#start-scene');
const status = document.querySelector('#scene-status');
start.addEventListener('click', async () => {
  start.disabled = true;
  start.textContent = 'Loading your Yeti…';
  status.textContent = 'Loading the interactive mascot…';
  try {
    await import('./scene.js');
    start.hidden = true;
  } catch (error) {
    console.error('Interactive mascot unavailable', error);
    status.textContent = 'The artwork is ready. Try the interactive mascot again.';
    start.disabled = false;
    start.textContent = 'Try the interactive Yeti again';
  }
});
