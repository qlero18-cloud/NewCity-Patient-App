// Etapa D — el lado del navegador de la auth de la Etapa C.
//
// No guarda nada. La sesión vive en una cookie HttpOnly firmada por el
// servidor, que es precisamente la que JavaScript no puede leer: por eso
// "¿hay sesión?" se contesta preguntándole al servidor (`session()`) y no
// mirando una variable local. La contraseña se manda y se suelta; este
// módulo no tiene dónde guardarla y la prueba lo fija.

export function createAuthClient({ api }) {
  async function pedir(method, path, body) {
    try {
      return await api.request(method, path, body);
    } catch {
      return null; // red caída
    }
  }

  return {
    // Se llama al abrir el panel, antes de que nadie haya hecho nada. Un
    // 401 aquí es la respuesta NORMAL —todavía no hay sesión—, no una
    // falla. Confundirlos haría que el panel muestre "algo salió mal" cada
    // vez que alguien lo abre por la mañana.
    async session() {
      const res = await pedir('GET', '/session');
      if (!res) return { ok: false, failed: true };
      if (res.status === 200) return { ok: true, user: res.body?.user };
      if (res.status === 401) return { ok: false, unauthenticated: true };
      return { ok: false, failed: true };
    },

    async signIn({ username, password }) {
      const res = await pedir('POST', '/login', { username, password });
      if (!res) return { ok: false, failed: true };
      if (res.status === 200) return { ok: true, user: res.body?.user };
      // Un solo motivo, porque el servidor da uno solo: usuario que no
      // existe, contraseña mala y cuenta bloqueada salen todos por el mismo
      // 401 (authHandler.js:38). El cliente no inventa una distinción que
      // el servidor se negó a dar.
      if (res.status === 401) return { ok: false, invalidCredentials: true };
      // Todo lo demás es del servidor, no de quien teclea. Sin
      // SESSION_SECRET las Functions truenan con 500, y llamarle a eso
      // "contraseña incorrecta" manda a probar contraseñas media hora en
      // vez de a revisar la variable de entorno.
      return { ok: false, failed: true };
    },

    // Siempre ok. Quien le dio a "Salir" quiere dejar de tener sesión en
    // esta pantalla; dejarla abierta porque la red falló es lo contrario de
    // lo que pidió, y en una máquina compartida de coordinación eso sí
    // importa. La cookie sigue viva del lado del servidor hasta que caduque
    // —una cookie firmada no se puede invalidar desde aquí— pero el panel
    // se cierra, que es lo que está en manos del cliente hacer.
    async signOut() {
      await pedir('POST', '/logout');
      return { ok: true };
    },
  };
}
