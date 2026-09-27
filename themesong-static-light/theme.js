/* YouTube Music's own light defaults only apply once the root element says so,
   which a stylesheet cannot do - hence the one-line script. */
module.exports = {
  mount() {
    const root = document.documentElement;
    root.removeAttribute('dark');
    root.setAttribute('light', 'true');

    return () => {
      root.setAttribute('dark', 'true');
      root.removeAttribute('light');
    };
  },
  unmount() {},
};
