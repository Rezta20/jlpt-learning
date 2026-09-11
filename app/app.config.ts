export default defineAppConfig({
  ui: {
    colors: {
      primary: 'teal',
      neutral: 'stone'
    },
    button: {
      slots: {
        base: 'font-medium touch-manipulation max-md:min-h-11 max-md:min-w-11'
      }
    },
    card: {
      slots: {
        root: 'rounded-xl shadow-none ring-1 ring-default'
      }
    }
  }
})
