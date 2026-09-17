/**
 * channels.js
 * ------------------------------------------------------------------
 * Lista manual de canales de "TV en Vivo".
 *
 * Para agregar un canal nuevo, copia un bloque y cambia sus datos.
 * No es necesario tocar el HTML ni el resto del JS.
 *
 * Cada canal tiene:
 *   id      -> identificador único, sin espacios (se usa internamente)
 *   name    -> nombre visible en la tarjeta y en el reproductor
 *   logo    -> ruta a la imagen del logo (assets/logos/...) o URL externa.
 *              Si no existe la imagen, se muestra automáticamente
 *              una insignia con la inicial del canal.
 *   servers -> lista de servidores disponibles para ese canal.
 *              Cada servidor tiene "name" (nombre del botón) y
 *              "url" (enlace .m3u8 / .m3u del stream HLS).
 *              Puedes agregar más de un servidor por canal.
 * ------------------------------------------------------------------
 */

const CHANNELS = [
  {
    id: "canal5",
    name: "Canal 5",
    logo: "assets/logos/canal5.png",
    servers: [
        {
        name: "Servidor 1",
        url: "https://razen.futlivehd.com/canal5mx/index.m3u8?ip=187.161.17.89&token=416eb063bf4c23c945caca48be142986e299dbeb-b8-1789657264-1789603264"
      }
    ]
  },

   {
    id: "dk",
    name: "Discovery kids",
    logo: "assets/logos/dk.png",
    servers: [
      {
        name: "Servidor 1",
        url: "https://pelisjuanita.xyz/proxy/ssl/?url=http%3A%2F%2F181.119.215.61%3A8000%2Fplay%2Fa03l%2Findex.m3u8%3Fhls"
      }
    ]
  },
  {
    id: "azteca7",
    name: "Azteca 7",
    logo: "assets/logos/a7.png",
    servers: [
      {
        name: "Servidor 1",
        url: "https://6.ftlly.com/azteca7/mono.m3u8?token=508dbbf8da420ee6306c65aee1841ac6db83f507-ff-1789200160-1789182160"
      },
      {
        name: "Servidor 2",
        url: "https://6.ftlly.com/azteca7/mono.m3u8?token=508dbbf8da420ee6306c65aee1841ac6db83f507-ff-1789200160-1789182160"
      }

    ]
  },
  {
    id: "ch8",
    name: "Chavo del 8 25/8",
    logo: "assets/logos/ch.png",
    servers: [
      {
        name: "Servidor 1",
        url: "https://live20.bozztv.com/giatvplayout7/giatv-211465/tracks-v1a1/mono.ts.m3u8"
      }
    ]
  },
  {
    id: "televisa",
    name: "Televisa",
    logo: "assets/logos/tele.webp",
    servers: [
      {
        name: "Servidor 1",
        url: "https://televisa-televisa-1-it.samsung.wurl.tv/3000.m3u8"
      }
    ]
  },
  {
    id: "simps",
    name: "Los Simpsons 25/8",
    logo: "assets/logos/simp.png",
    servers: [
      {
        name: "Servidor 1",
        url: "https://lbgo.bozztv.com/ssh101/ssh101/simplat/playlist.m3u8"
      }
    ]
  },
];
