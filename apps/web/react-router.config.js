export default {
    appDirectory: "src",
    // SPA mode. There is no server render for this app: it is a PWA that has to
    // work from a cached shell on a phone with no signal, and a route that needs
    // a server round-trip to paint is a route that does not exist underground.
    ssr: false,
};
