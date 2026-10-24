Fonts required by app.minzmahallu.core.ui.theme.Type

Both families are licensed under the SIL Open Font License 1.1, so they may be
bundled and redistributed with the app.

  res/font/poppins_regular.ttf        Poppins Regular  (400)
  res/font/poppins_medium.ttf         Poppins Medium   (500)
  res/font/poppins_semibold.ttf       Poppins SemiBold (600)
  res/font/poppins_bold.ttf           Poppins Bold     (700)
  res/font/anek_malayalam_regular.ttf Anek Malayalam Regular  (400)
  res/font/anek_malayalam_medium.ttf  Anek Malayalam Medium   (500)
  res/font/anek_malayalam_semibold.ttf Anek Malayalam SemiBold (600)
  res/font/anek_malayalam_bold.ttf    Anek Malayalam Bold      (700)

The desktop app already ships Poppins at resources/fonts/*.ttf — copy those four
straight over. For Anek Malayalam the desktop ships the variable WOFF2; Android
needs TTF, so grab the four static weights from Google Fonts:

  https://fonts.google.com/specimen/Anek+Malayalam

A placeholder build can drop the real files in later without touching any code:
only the eight file names above are referenced, all from Type.kt.
