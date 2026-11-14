# Colonos

Juego de colonos para jugar en grupo: el ordenador o la tele muestra el tablero 3D y cada jugador usa su móvil como mando.

## Cómo se juega

1. Abre la web en el ordenador (o en el navegador de la tele) y pulsa **Crear partida**.
2. Elige jugadores, tamaño del mapa, niebla y puntos para ganar. Pulsa **Crear sala**.
3. Cada jugador escanea el QR (o entra en `jugar.html` con el código de 4 letras).
4. Cuando estéis todos, pulsa **Empezar partida**.

En el móvil: **Mano** (recursos, construir, cartas de desarrollo, costes), **Mapa** (tocar para colocar y confirmar), **Comercio** (banco, puertos y tratos con el resto) y **Partida** (jugadores y registro).

En la pantalla: ratón para girar, rueda para el zoom, `C` cámara que sigue el turno, `H` ocultar marcadores, `F` pantalla completa.

## Técnica

- Web estática (sin servidor propio). Conexión directa pantalla ↔ móviles con WebRTC (PeerJS).
- Tablero en Three.js generado al azar; tamaño según jugadores (mínimo 4,75 hexágonos por jugador, como el original).
- La partida se guarda en el navegador de la pantalla: si se recarga, se puede reanudar la sala.
- Modo de pruebas sin red: añade `?local=1` y abre la pantalla y los mandos en pestañas del mismo navegador.
