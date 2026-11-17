/* Pruebas automáticas básicas.  Ejecutar: npm test */
'use strict';
process.env.DATA_DIR = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'alki-test-'));
process.removeAllListeners('warning');
const test = require('node:test');
const assert = require('node:assert');
const cif = require('../server/seguridad/cifrado');
const totp = require('../server/seguridad/totp');
const { validar } = require('../server/seguridad/validar');
const { parsearCSV } = require('../server/integraciones/csv-homming');

test('las contraseñas se guardan con hash y se verifican', async () => {
  const h = await cif.hashClave('Una-frase-larga-de-prueba');
  assert.ok(h.startsWith('scrypt$'));
  assert.ok(!h.includes('Una-frase'));
  assert.strictEqual(await cif.verificarClave('Una-frase-larga-de-prueba', h), true);
  assert.strictEqual(await cif.verificarClave('otra', h), false);
});

test('política de contraseñas', () => {
  assert.ok(cif.validarClave('corta'));
  assert.ok(cif.validarClave('daniel-123456789', 'daniel@alki.casa'));
  assert.strictEqual(cif.validarClave('Mi-piso-de-Ruzafa-tiene-5', 'daniel@alki.casa'), null);
});

test('cifrado AES-GCM: ida y vuelta, y detecta manipulación', () => {
  const c = cif.cifrar('token-secreto');
  assert.strictEqual(cif.descifrar(c), 'token-secreto');
  const roto = c.slice(0, -4) + 'AAAA';
  assert.throws(() => cif.descifrar(roto));
});

test('TOTP: acepta el código actual una sola vez', () => {
  const s = totp.nuevoSecreto();
  const paso = Math.floor(Date.now() / 30000);
  const ok = totp.verificar(s, totp.codigo(s, paso), 0);
  assert.ok(ok);
  assert.strictEqual(totp.verificar(s, totp.codigo(s, paso), ok), 0, 'no se puede reutilizar');
  assert.strictEqual(totp.verificar(s, '000000', 0) && totp.codigo(s, paso) !== '000000', 0);
});

test('validación de entradas', () => {
  assert.deepStrictEqual(validar({ importe: '12,50', x: 'ignorado' }, { importe: { tipo: 'euros' } }), { importe: 1250 });
  assert.throws(() => validar({ fecha: '2026-13-01' }, { fecha: { tipo: 'fecha' } }));
  assert.throws(() => validar({}, { nombre: { tipo: 'texto', req: true } }));
  assert.throws(() => validar({ rol: 'superadmin' }, { rol: { tipo: 'enum', valores: ['admin'] } }));
});

test('permisos por pestaña, por rol y por persona', () => {
  const { tiene, efectivos } = require('../server/seguridad/permisos');
  assert.ok(tiene({ rol: 'admin' }, 'admin.usuarios'));
  assert.ok(tiene({ rol: 'admin', permisos: '[]' }, 'pagos.editar'), 'el administrador siempre lo tiene todo');
  assert.ok(!tiene({ rol: 'operativo' }, 'pagos.ver'));
  assert.ok(!tiene({ rol: 'operativo' }, 'inquilinos.ver'));
  assert.ok(tiene({ rol: 'operativo' }, 'incidencias.editar'));
  assert.ok(tiene({ rol: 'gestion' }, 'gastos.editar'));
  // Permisos personalizados: sustituyen a los del rol; editar implica ver
  const u = { rol: 'operativo', permisos: JSON.stringify(['gastos.editar']) };
  assert.ok(tiene(u, 'gastos.ver') && tiene(u, 'gastos.editar'));
  assert.ok(!tiene(u, 'incidencias.ver'));
  assert.deepStrictEqual(efectivos({ rol: 'gestion', permisos: JSON.stringify(['inventado.ver']) }), []);
});

test('lector de CSV con comillas y punto y coma', () => {
  const f = parsearCSV('﻿"A";B\n"x;y";"con ""comillas"""\n');
  assert.deepStrictEqual(f, [['A', 'B'], ['x;y', 'con "comillas"']]);
});
