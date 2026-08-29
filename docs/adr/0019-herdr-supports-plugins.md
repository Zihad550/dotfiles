# Herdr supports plugins as an extension boundary

Herdr 0.8.2 supports executable workflow plugins through `herdr plugin` and
the socket API. Plugins can provide actions, event hooks, terminal panes, and
dynamic sidebar metadata without changing Herdr itself. When a wanted Herdr
behavior is absent from configuration, check the plugin marketplace and plugin
API before adding an in-repo workaround or treating an upstream change as the
only option. Community plugins are unreviewed, so adopting one still requires
reviewing its manifest and source; a plugin also cannot alter UI behavior that
Herdr's plugin API does not expose.
