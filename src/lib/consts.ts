export const Consts = {
  dev: import.meta.env.DEV,

  flags: {
    // Flip locally to replay the latest three incoming notifications on each development reload.
    telegramFeedReplay: false,
  },
}
