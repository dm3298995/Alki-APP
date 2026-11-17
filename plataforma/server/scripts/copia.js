/* scripts/copia.js — Crear una copia de seguridad ahora.  Uso: npm run copia */
'use strict';
process.removeAllListeners('warning');
console.log('Copia creada en data/copias/' + require('../servicios/copias').crear());
