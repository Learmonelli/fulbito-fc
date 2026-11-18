// Esta app tiene un solo aspecto: el tema "Cancha arcade" (pixel).
// Los estilos del modo Pixel cuelgan de data-theme="pixel" en <html>; se fija una vez al cargar.
document.documentElement.dataset.theme = 'pixel';
// Limpia la preferencia de la versión anterior, que tenía un selector Pixel / Moderno.
try { localStorage.removeItem('ffc_theme'); } catch { /* sin almacenamiento: nada que limpiar */ }
