# Sushi contador

Una app para contar las piezas de sushi que te comes en el buffet, guardar cada día y picarte con tus amigos.

Es una PWA: se instala en el móvil y funciona sin conexión. Sin cuentas, sin anuncios y sin nada de pago.

**Pruébala:** https://sushi-contador.vercel.app

## Qué hace

- Tocas la pantalla y suma una pieza. También hay botones de +2, +4 y +8 para los platos, y deshacer.
- El color sube con cada pieza hasta la línea de tu récord. Si la pasas, se llena entera.
- Historial con la fecha y la cantidad de cada día. El récord sale más grande y en color.
- Puedes separar por tipo (nigiri, maki, sashimi…) y apuntar restaurante, precio y una nota. Con el precio te dice a cuánto te ha salido la pieza.
- Mesa en directo: creas una, los demás entran con el QR o el código, y veis el ranking al momento. También se puede añadir a alguien sin móvil.
- «¿Quién se come la última?», para cuando queda una pieza.
- Logros, estadísticas y una imagen para compartir.
- Copia de seguridad para pasar tus días a otro móvil.

El día cambia a las 5 de la mañana, así una cena que pasa de medianoche cuenta entera.

## Por dentro

HTML, CSS y JavaScript a pelo, sin frameworks ni nada que compilar.

- `public/`: la app. La lógica sin pantalla está en `js/logic.js`.
- `api/mesa.js`: la función de Vercel de la mesa en directo. Usa Runtime Cache y se borra sola a las 14 horas.
- `public/sw.js`: lo que hace que funcione sin internet. Al cambiar algún archivo hay que subir la versión de `CACHE`.

Cada móvil manda a la mesa todo lo que sabe de ella y se queda con lo más nuevo de cada persona. Si el servidor pierde algo o alguien se queda sin cobertura, se recupera solo.

## Arrancarlo en local

Hace falta Node 22 o más.

```bash
npm install
npm run dev    # http://localhost:4173
npm test
```

Está en Vercel: cada vez que subo un cambio a GitHub se actualiza sola.

## Licencias de terceros

- Tipografía [Gabarito](https://fonts.google.com/specimen/Gabarito) (SIL Open Font License).
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) de Kazuhiko Arase (MIT).
