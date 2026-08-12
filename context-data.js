/* context-data.js – Offline book/chapter context for KJV Study PWA v6.24.0
   Public-domain-style short overviews only. No network. No commentary.
   Used by the lightweight Context panel.
*/

/** Book-level purpose (1–3 sentences) and key themes for every canonical book. */
const BOOK_META = {
  gen: {
    purpose: "Genesis opens Scripture by recounting the creation of the world, the entrance of sin, and God's first covenant promises to humanity through Abraham and his descendants. It sets the stage for the rest of the Bible's story of redemption.",
    themes: ["Creation", "Sin and the Fall", "Covenant", "Promise to Abraham", "Family and nation beginnings"]
  },
  exo: {
    purpose: "Exodus tells how God delivers Israel from slavery in Egypt, gives the Law at Sinai, and establishes the tabernacle so He may dwell among His people.",
    themes: ["Deliverance", "Covenant Law", "God's presence", "Worship", "Obedience"]
  },
  lev: {
    purpose: "Leviticus provides the sacrificial system, purity laws, and priestly instructions that allow a holy God to dwell with an unclean people.",
    themes: ["Holiness", "Sacrifice", "Atonement", "Purity", "Priestly mediation"]
  },
  num: {
    purpose: "Numbers records Israel's wilderness journey, census, rebellions, and God's continued guidance toward the Promised Land despite the people's unbelief.",
    themes: ["Wilderness testing", "Faith vs. unbelief", "Divine guidance", "Covenant faithfulness"]
  },
  deu: {
    purpose: "Deuteronomy is Moses' final sermons restating the Law, calling the new generation to covenant loyalty before they enter Canaan.",
    themes: ["Covenant renewal", "Love for God", "Obedience", "Blessing and curse", "Remember"]
  },
  jos: {
    purpose: "Joshua recounts the conquest and allotment of the land under Joshua's leadership, showing God keeping His promise to give Israel rest.",
    themes: ["Conquest", "Covenant faithfulness", "Rest in the land", "Leadership"]
  },
  jdg: {
    purpose: "Judges cycles through Israel's repeated apostasy, oppression, cries for help, and temporary deliverance by judges God raises up.",
    themes: ["Apostasy", "Deliverance", "Cycle of sin", "Need for a true king"]
  },
  rut: {
    purpose: "Ruth is a short story of loyalty, kindness, and God's providence that brings a Moabite woman into the line of David and ultimately the Messiah.",
    themes: ["Loyalty", "Redemption", "Providence", "Gentile inclusion"]
  },
  "1sa": {
    purpose: "1 Samuel covers the transition from judges to monarchy: Samuel's ministry, Saul's rise and failure, and the anointing of David.",
    themes: ["Kingship", "Obedience vs. rebellion", "Heart for God", "Transition of leadership"]
  },
  "2sa": {
    purpose: "2 Samuel traces David's reign—his triumphs, the covenant God makes with him, and the consequences of his sin.",
    themes: ["Davidic covenant", "Kingship under God", "Sin and consequences", "God's steadfast love"]
  },
  "1ki": {
    purpose: "1 Kings records Solomon's wisdom and temple, the division of the kingdom, and the early kings of Israel and Judah with prophetic confrontation.",
    themes: ["Wisdom", "Temple", "Divided kingdom", "Prophetic word", "Idolatry"]
  },
  "2ki": {
    purpose: "2 Kings continues the history of the divided kingdoms until both fall under judgment, while prophets call the people back to the Lord.",
    themes: ["Judgment", "Prophetic warning", "Exile", "Remnant hope"]
  },
  "1ch": {
    purpose: "1 Chronicles retells Israel's history with emphasis on the Davidic line, the temple, and true worship, written for the post-exilic community.",
    themes: ["Davidic line", "Temple worship", "Genealogy", "Covenant hope"]
  },
  "2ch": {
    purpose: "2 Chronicles focuses on the kings of Judah, the temple, and reforms, ending with the exile and a note of hope for return.",
    themes: ["Temple", "Reform", "Seeking the Lord", "Exile and hope"]
  },
  ezr: {
    purpose: "Ezra describes the return from exile, the rebuilding of the temple, and the restoration of the Law under Ezra's leadership.",
    themes: ["Return from exile", "Temple rebuilt", "Law restored", "Holiness"]
  },
  neh: {
    purpose: "Nehemiah records the rebuilding of Jerusalem's walls and the renewal of the covenant community under Nehemiah's governorship.",
    themes: ["Rebuilding", "Leadership", "Covenant renewal", "Opposition"]
  },
  est: {
    purpose: "Esther shows God's hidden providence protecting His people from destruction in Persia through Esther and Mordecai.",
    themes: ["Providence", "Deliverance", "Courage", "Jewish survival"]
  },
  job: {
    purpose: "Job explores the mystery of suffering and God's sovereignty through the trials of a righteous man and the dialogues that follow.",
    themes: ["Suffering", "Sovereignty of God", "Faith under trial", "Wisdom"]
  },
  psa: {
    purpose: "Psalms is Israel's prayer and praise book—songs of lament, thanksgiving, wisdom, and trust that give voice to every season of the soul before God.",
    themes: ["Worship", "Lament", "Trust", "Kingship of God", "Torah"]
  },
  pro: {
    purpose: "Proverbs collects wisdom sayings that teach the fear of the Lord as the beginning of knowledge and guide practical godly living.",
    themes: ["Wisdom", "Fear of the Lord", "Righteous vs. wicked", "Speech and work"]
  },
  ecc: {
    purpose: "Ecclesiastes examines life under the sun and concludes that true meaning is found only in fearing God and keeping His commandments.",
    themes: ["Vanity of life under the sun", "Fear of God", "Enjoy God's gifts", "Judgment"]
  },
  sng: {
    purpose: "Song of Solomon celebrates pure marital love as a gift from God and has long been read also as a picture of covenant love between God and His people.",
    themes: ["Love", "Marriage", "Desire", "Covenant affection"]
  },
  isa: {
    purpose: "Isaiah proclaims judgment on sin, the holiness of God, and the coming of the Servant who will bring salvation to Israel and the nations.",
    themes: ["Holiness of God", "Judgment", "Messianic hope", "Servant of the Lord", "New creation"]
  },
  jer: {
    purpose: "Jeremiah warns Judah of coming exile because of covenant unfaithfulness, yet also announces a new covenant and future restoration.",
    themes: ["Covenant unfaithfulness", "Exile", "New covenant", "Weeping prophet"]
  },
  lam: {
    purpose: "Lamentations is a series of poetic laments over the destruction of Jerusalem, expressing grief while clinging to God's faithfulness.",
    themes: ["Grief", "Judgment", "Hope in God's mercies", "Confession"]
  },
  eze: {
    purpose: "Ezekiel, prophesying among the exiles, reveals God's glory, the reasons for judgment, and the promise of a restored temple and people.",
    themes: ["Glory of God", "Individual responsibility", "New heart", "Restored temple"]
  },
  dan: {
    purpose: "Daniel shows God's sovereignty over empires through the faithfulness of Daniel and his friends and through visions of future kingdoms and the Son of Man.",
    themes: ["Sovereignty of God", "Faithfulness in exile", "Kingdoms of this world", "Son of Man"]
  },
  hos: {
    purpose: "Hosea uses the prophet's own marriage as a living picture of God's steadfast love toward unfaithful Israel and the call to return.",
    themes: ["Covenant love", "Unfaithfulness", "Repentance", "Restoration"]
  },
  joe: {
    purpose: "Joel calls the people to repentance in the face of a locust plague and looks ahead to the Day of the Lord and the outpouring of the Spirit.",
    themes: ["Day of the Lord", "Repentance", "Spirit poured out", "Judgment and restoration"]
  },
  amo: {
    purpose: "Amos confronts social injustice and empty religion in Israel, declaring that the Lord requires justice and righteousness.",
    themes: ["Justice", "Righteousness", "Social sin", "Day of the Lord"]
  },
  oba: {
    purpose: "Obadiah pronounces judgment on Edom for its pride and violence against Judah and looks to the day when the kingdom will be the Lord's.",
    themes: ["Pride", "Brotherly violence", "Day of the Lord", "Kingdom of God"]
  },
  jon: {
    purpose: "Jonah tells of a reluctant prophet sent to Nineveh, revealing God's compassion for the nations and exposing the prophet's own hard heart.",
    themes: ["God's mercy to the nations", "Repentance", "Prophetic reluctance", "Compassion"]
  },
  mic: {
    purpose: "Micah indicts both Israel and Judah for injustice, yet promises a ruler from Bethlehem and a future of peace under the Lord.",
    themes: ["Justice", "Messianic ruler", "True worship", "Do justice, love mercy"]
  },
  nah: {
    purpose: "Nahum announces the downfall of Nineveh, affirming that God is a stronghold for those who trust Him and an avenger of evil.",
    themes: ["Judgment on Assyria", "God as refuge", "Justice of God"]
  },
  hab: {
    purpose: "Habakkuk wrestles with God's use of a wicked nation to judge Judah and learns to live by faith, ending in confident trust.",
    themes: ["Faith", "Theodicy", "Living by faith", "God's justice"]
  },
  zep: {
    purpose: "Zephaniah warns of the coming Day of the Lord and calls the humble to seek the Lord, promising a remnant will be restored.",
    themes: ["Day of the Lord", "Seek the Lord", "Remnant", "Joy of restoration"]
  },
  hag: {
    purpose: "Haggai urges the returned exiles to finish rebuilding the temple, promising that the latter glory will be greater and that God is with them.",
    themes: ["Rebuild the temple", "God's presence", "Priority of worship", "Future glory"]
  },
  zec: {
    purpose: "Zechariah encourages the rebuilding community with visions of hope, calls for true justice, and points to the coming King and Shepherd.",
    themes: ["Visions of hope", "The Branch", "True fasting", "Coming King"]
  },
  mal: {
    purpose: "Malachi confronts post-exilic spiritual apathy, calls for faithful worship and justice, and looks ahead to the messenger who will prepare the way.",
    themes: ["Faithful worship", "Covenant faithfulness", "Messenger to come", "Day of the Lord"]
  },
  mat: {
    purpose: "Matthew presents Jesus as the promised Messiah and King who fulfills the Old Testament, teaches the kingdom, dies, and rises.",
    themes: ["Kingdom of heaven", "Fulfillment of Scripture", "Discipleship", "Jesus the King"]
  },
  mrk: {
    purpose: "Mark is a fast-paced account of Jesus the Servant-Messiah who proclaims the gospel, performs mighty works, suffers, and rises.",
    themes: ["Jesus the Servant", "Gospel of the kingdom", "Discipleship", "Suffering and glory"]
  },
  luk: {
    purpose: "Luke writes an orderly account of Jesus' life, death, and resurrection, emphasizing His concern for the poor, outcasts, and the work of the Spirit.",
    themes: ["Salvation for all", "Holy Spirit", "Prayer", "Care for the lowly"]
  },
  jhn: {
    purpose: "John presents Jesus as the eternal Son of God so that readers may believe and have life in His name through a series of signs and I am claims.",
    themes: ["Believe", "Eternal life", "Signs", "I am", "Love"]
  },
  act: {
    purpose: "Acts continues Luke's story, showing the risen Jesus working through the Spirit to spread the gospel from Jerusalem to the ends of the earth.",
    themes: ["Holy Spirit", "Witness", "Church growth", "Gentile inclusion"]
  },
  rom: {
    purpose: "Romans systematically explains the gospel: the righteousness of God revealed through faith in Jesus Christ for Jew and Gentile alike.",
    themes: ["Justification by faith", "Righteousness of God", "Grace", "Life in the Spirit", "Jew and Gentile"]
  },
  "1co": {
    purpose: "1 Corinthians addresses divisions, immorality, and questions in the Corinthian church, calling them to unity under the cross and resurrection hope.",
    themes: ["Unity", "Cross of Christ", "Love", "Spiritual gifts", "Resurrection"]
  },
  "2co": {
    purpose: "2 Corinthians defends Paul's apostolic ministry, boasts in weakness, and urges generosity and reconciliation.",
    themes: ["Ministry in weakness", "Comfort", "Reconciliation", "Generosity"]
  },
  gal: {
    purpose: "Galatians fiercely defends the gospel of justification by faith apart from works of the Law and calls believers to walk by the Spirit.",
    themes: ["Justification by faith", "Freedom in Christ", "Law vs. promise", "Fruit of the Spirit"]
  },
  eph: {
    purpose: "Ephesians unfolds the believer's position in Christ, the unity of Jew and Gentile in one body, and the call to walk worthy of the calling.",
    themes: ["In Christ", "Church as body", "Grace", "Spiritual warfare", "Unity"]
  },
  php: {
    purpose: "Philippians is a letter of joy and partnership, urging the church to humility like Christ's and to stand firm in the gospel.",
    themes: ["Joy", "Humility of Christ", "Partnership in gospel", "Contentment"]
  },
  col: {
    purpose: "Colossians exalts the supremacy of Christ over all things and calls the church to live out their new life in Him.",
    themes: ["Supremacy of Christ", "Fullness in Christ", "New life", "Against false teaching"]
  },
  "1th": {
    purpose: "1 Thessalonians encourages a young church in faith, love, and hope, and clarifies the coming of the Lord.",
    themes: ["Faith, love, hope", "Holy living", "Return of Christ", "Encouragement"]
  },
  "2th": {
    purpose: "2 Thessalonians corrects misunderstandings about the Day of the Lord and urges steadfastness and responsible living.",
    themes: ["Day of the Lord", "Steadfastness", "Work", "Man of lawlessness"]
  },
  "1ti": {
    purpose: "1 Timothy gives instructions for orderly church life, sound teaching, and godly leadership in Ephesus.",
    themes: ["Sound doctrine", "Church order", "Godliness", "Leadership"]
  },
  "2ti": {
    purpose: "2 Timothy is Paul's final charge to Timothy to guard the gospel, endure hardship, and preach the word faithfully.",
    themes: ["Guard the gospel", "Endure", "Scripture", "Faithful ministry"]
  },
  tit: {
    purpose: "Titus instructs Titus on appointing elders and teaching sound doctrine that produces good works on Crete.",
    themes: ["Sound doctrine", "Good works", "Elders", "Grace that trains"]
  },
  phm: {
    purpose: "Philemon is a personal appeal for the reception of the runaway slave Onesimus as a brother in Christ.",
    themes: ["Forgiveness", "Brotherhood in Christ", "Reconciliation"]
  },
  heb: {
    purpose: "Hebrews presents Jesus as the superior high priest and mediator of a better covenant, urging perseverance in faith.",
    themes: ["Superiority of Christ", "Better covenant", "Faith", "Perseverance"]
  },
  jas: {
    purpose: "James is a practical letter calling believers to living faith that works, controls the tongue, and shows mercy.",
    themes: ["Living faith", "Wisdom", "Tongue", "Rich and poor", "Patience"]
  },
  "1pe": {
    purpose: "1 Peter encourages suffering believers to stand firm in hope, live holy lives, and follow Christ's example.",
    themes: ["Hope", "Suffering", "Holiness", "Shepherd and flock"]
  },
  "2pe": {
    purpose: "2 Peter warns against false teachers and urges growth in godliness while looking for the day of the Lord.",
    themes: ["False teachers", "Growth in godliness", "Day of the Lord", "Scripture"]
  },
  "1jn": {
    purpose: "1 John assures believers of eternal life, tests true fellowship with God, and calls for love and obedience.",
    themes: ["Assurance", "Light and darkness", "Love", "Truth vs. error"]
  },
  "2jn": {
    purpose: "2 John warns a chosen lady and her children to walk in truth and love and not to receive false teachers.",
    themes: ["Truth", "Love", "Watch against deceivers"]
  },
  "3jn": {
    purpose: "3 John commends Gaius for hospitality to traveling workers and rebukes Diotrephes who loves to be first.",
    themes: ["Hospitality", "Support for workers", "Truth"]
  },
  jud: {
    purpose: "Jude urges believers to contend for the faith against ungodly infiltrators and to keep themselves in the love of God.",
    themes: ["Contend for the faith", "False teachers", "Keep in God's love"]
  },
  rev: {
    purpose: "Revelation unveils Jesus Christ as the risen Lord who rules history, comforts the churches, and brings the final victory of God and the new creation.",
    themes: ["Sovereignty of Christ", "Worship", "Judgment and victory", "New heaven and earth"]
  }
};

/** Chapter-specific outline and place-in-story. Keyed as "bookId.chapter". */
const CHAPTER_DATA = {
  "gen.1": {
    outline: [
      "1–2: In the beginning God creates the heavens and the earth; the Spirit moves on the waters.",
      "3–5: Day 1 — light and darkness.",
      "6–8: Day 2 — the firmament (heaven).",
      "9–13: Day 3 — dry land, seas, and vegetation.",
      "14–19: Day 4 — sun, moon, and stars.",
      "20–23: Day 5 — sea creatures and birds.",
      "24–31: Day 6 — land animals and mankind in God's image; very good."
    ],
    place: "This is the opening chapter of Scripture and of Genesis. It establishes God as Creator of all things and sets the stage for the rest of the Bible's story of creation, fall, and redemption."
  },
  "gen.2": {
    outline: [
      "1–3: God finishes His work and rests on the seventh day, blessing and sanctifying it.",
      "4–7: Detailed account of forming man from the dust and breathing life into him.",
      "8–14: The garden of Eden planted; the tree of life and the tree of the knowledge of good and evil; four rivers.",
      "15–17: Man placed in the garden to dress and keep it; the command not to eat of the forbidden tree.",
      "18–25: Woman formed from man's side; the first marriage; both naked and not ashamed."
    ],
    place: "Chapter 2 expands the sixth day of creation, focusing on the formation of man and woman and the ideal setting of Eden before the fall recorded in chapter 3."
  },
  "gen.3": {
    outline: [
      "1–7: The serpent tempts Eve; both eat the forbidden fruit; eyes opened; shame.",
      "8–13: God confronts Adam and Eve; blame-shifting.",
      "14–19: Curses on the serpent, the woman, and the man; promise of the woman's seed.",
      "20–24: Adam names Eve; God clothes them; expulsion from Eden and the way to the tree of life guarded."
    ],
    place: "The turning point of the early chapters: the entrance of sin, death, and exile from God's presence, yet with the first gospel promise (3:15)."
  },
  "gen.4": {
    outline: [
      "1–8: Cain and Abel's offerings; Cain murders Abel.",
      "9–16: God confronts Cain; the mark; Cain dwells in the land of Nod.",
      "17–24: Cain's line and the rise of culture and violence (Lamech).",
      "25–26: Seth born; men begin to call on the name of the Lord."
    ],
    place: "Shows the rapid spread of sin after the fall and the preservation of a line that calls on the Lord."
  },
  "gen.5": {
    outline: [
      "1–32: Genealogy from Adam to Noah, emphasizing that all die, yet Enoch walks with God and is taken."
    ],
    place: "Bridges the early history to the flood generation and highlights mortality after the fall."
  },
  "gen.6": {
    outline: [
      "1–8: Wickedness multiplies; God determines to destroy man; Noah finds grace.",
      "9–22: Noah is just; God commands the ark and establishes His covenant with Noah."
    ],
    place: "Introduces the flood judgment and the one righteous man through whom God will preserve life."
  },
  "gen.7": {
    outline: [
      "1–24: Noah, his family, and the animals enter the ark; the flood comes and covers the earth; all flesh outside the ark dies."
    ],
    place: "The execution of the judgment announced in chapter 6; salvation is only inside the ark."
  },
  "gen.8": {
    outline: [
      "1–19: The waters recede; the ark rests; Noah sends birds; they leave the ark.",
      "20–22: Noah's burnt offering; God promises never again to curse the ground in the same way or destroy all flesh by flood."
    ],
    place: "Transition from judgment to new beginning; God's covenant faithfulness after the flood."
  },
  "gen.9": {
    outline: [
      "1–17: Blessing and command to be fruitful; permission to eat meat; prohibition of blood; the rainbow covenant.",
      "18–29: Noah's drunkenness; the sin of Ham; blessing on Shem and Japheth; curse on Canaan."
    ],
    place: "Establishes the post-flood order and the covenant sign that still stands."
  },
  "gen.10": {
    outline: [
      "1–32: The table of nations—descendants of Japheth, Ham, and Shem."
    ],
    place: "Shows the spread of peoples after the flood and sets the stage for Babel and the call of Abraham."
  },
  "gen.11": {
    outline: [
      "1–9: The tower of Babel; languages confused; people scattered.",
      "10–32: Genealogy from Shem to Abram; Terah's family moves toward Canaan."
    ],
    place: "Explains the origin of nations and languages and brings the narrative to the family of Abram."
  },
  "gen.12": {
    outline: [
      "1–9: God calls Abram; the promise of land, nation, and blessing to all families; Abram goes to Canaan and builds altars.",
      "10–20: Famine; Abram goes to Egypt; the incident with Pharaoh."
    ],
    place: "The pivotal call that begins the Abrahamic covenant story which drives the rest of Genesis and the Bible."
  },
  "gen.13": {
    outline: [
      "1–18: Abram and Lot separate; Lot chooses the plain of Jordan; God reaffirms the land promise to Abram."
    ],
    place: "Continues Abram's journey of faith and the unfolding of the land promise."
  },
  "gen.14": {
    outline: [
      "1–16: War of the kings; Lot taken; Abram rescues him.",
      "17–24: Melchizedek blesses Abram; Abram refuses the king of Sodom's goods."
    ],
    place: "Shows Abram as a man of faith and integrity, and introduces Melchizedek, later significant in Hebrews."
  },
  "gen.15": {
    outline: [
      "1–21: God appears to Abram; the promise of an heir; the covenant ceremony with the smoking furnace and burning lamp; the land boundaries and prediction of Egyptian sojourn."
    ],
    place: "The formal cutting of the Abrahamic covenant; foundational for later Scripture."
  },
  "gen.16": {
    outline: [
      "1–16: Sarai gives Hagar to Abram; Ishmael is born; the angel of the Lord appears to Hagar."
    ],
    place: "Human attempt to fulfill the promise; the birth of Ishmael and the tension that follows."
  },
  "gen.17": {
    outline: [
      "1–27: God changes Abram's and Sarai's names; the everlasting covenant; circumcision as the sign; Isaac is promised."
    ],
    place: "Covenant confirmation and the specific promise of Isaac through Sarah."
  },
  "gen.18": {
    outline: [
      "1–15: The Lord appears to Abraham; the promise of a son restated; Sarah laughs.",
      "16–33: Abraham intercedes for Sodom."
    ],
    place: "Hospitality to the Lord, confirmation of Isaac, and Abraham as intercessor."
  },
  "gen.19": {
    outline: [
      "1–29: Angels in Sodom; Lot's rescue; destruction of the cities; Lot's wife.",
      "30–38: Lot and his daughters; the origin of Moab and Ammon."
    ],
    place: "Judgment on extreme wickedness and the narrow escape of Lot."
  },
  "gen.20": {
    outline: [
      "1–18: Abraham and Abimelech; the sister ruse again; God protects Sarah."
    ],
    place: "Another test of faith and God's protection of the promised line."
  },
  "gen.21": {
    outline: [
      "1–21: Isaac is born; Hagar and Ishmael are sent away; God provides for them.",
      "22–34: Covenant with Abimelech at Beersheba."
    ],
    place: "The long-awaited birth of the child of promise and the separation of the two sons."
  },
  "gen.22": {
    outline: [
      "1–19: God tests Abraham; the near-sacrifice of Isaac; the ram provided; the covenant oath reaffirmed.",
      "20–24: News of Nahor's family."
    ],
    place: "The supreme test of Abraham's faith and a vivid picture of substitutionary provision."
  },
  "gen.23": {
    outline: [
      "1–20: Sarah dies; Abraham buys the cave of Machpelah as a burial place."
    ],
    place: "The first permanent foothold in the promised land—a burial site."
  },
  "gen.24": {
    outline: [
      "1–67: Abraham's servant seeks a wife for Isaac; Rebekah is found and brought; Isaac and Rebekah marry."
    ],
    place: "Securing the next generation of the covenant line through God's providence."
  },
  "gen.25": {
    outline: [
      "1–18: Abraham's later descendants and death; Ishmael's line.",
      "19–34: Birth of Esau and Jacob; Esau sells his birthright."
    ],
    place: "Transition to the generation of Isaac and the beginning of the Jacob–Esau conflict."
  },
  "gen.26": {
    outline: [
      "1–35: Isaac in Gerar; the sister ruse; wells; covenant with Abimelech; Esau's Hittite wives."
    ],
    place: "Isaac experiences similar tests and confirmations of the promise given to Abraham."
  },
  "gen.27": {
    outline: [
      "1–46: Jacob, with Rebekah's help, deceives Isaac and obtains the blessing; Esau's hatred; Jacob flees."
    ],
    place: "The blessing passes to Jacob by deception, setting up his years away from home."
  },
  "gen.28": {
    outline: [
      "1–9: Isaac blesses Jacob and sends him to Padan-aram; Esau takes another wife.",
      "10–22: Jacob's dream at Bethel; the ladder; God's promise restated; Jacob's vow."
    ],
    place: "God meets the fleeing Jacob and renews the Abrahamic promise to him."
  },
  "gen.29": {
    outline: [
      "1–30: Jacob meets Rachel; serves Laban seven years for Rachel but receives Leah; serves another seven for Rachel.",
      "31–35: Leah bears Reuben, Simeon, Levi, and Judah."
    ],
    place: "Jacob begins to reap deception and the family that will become the twelve tribes starts."
  },
  "gen.30": {
    outline: [
      "1–24: The remaining children of Leah, Bilhah, Zilpah, and Rachel (Joseph is born).",
      "25–43: Jacob's agreement with Laban and the increase of his flocks."
    ],
    place: "Completion of the twelve sons and Jacob's growing prosperity under Laban."
  },
  "gen.31": {
    outline: [
      "1–55: God tells Jacob to return; Jacob flees with his family; Laban pursues; covenant at Mizpah."
    ],
    place: "Jacob leaves Mesopotamia under God's protection and heads back toward Canaan."
  },
  "gen.32": {
    outline: [
      "1–32: Jacob prepares to meet Esau; wrestles with the angel at Peniel; name changed to Israel."
    ],
    place: "The crisis and transformation of Jacob before reunion with Esau."
  },
  "gen.33": {
    outline: [
      "1–20: Jacob and Esau meet peaceably; Jacob settles at Shechem and builds an altar."
    ],
    place: "Reconciliation and a tentative return to the land."
  },
  "gen.34": {
    outline: [
      "1–31: Dinah is defiled; Simeon and Levi avenge her; Jacob rebukes them."
    ],
    place: "Trouble in the land and the cost of the brothers' violence."
  },
  "gen.35": {
    outline: [
      "1–15: Jacob goes to Bethel; God reaffirms the name Israel and the promises.",
      "16–29: Rachel dies bearing Benjamin; Reuben's sin; Isaac dies."
    ],
    place: "Covenant renewal at Bethel and the completion of the twelve sons; end of the Isaac generation."
  },
  "gen.36": {
    outline: [
      "1–43: The generations of Esau (Edom)."
    ],
    place: "Records Esau's line before focusing fully on Jacob's family."
  },
  "gen.37": {
    outline: [
      "1–36: Joseph's dreams; his brothers' hatred; sold into Egypt; Jacob mourns."
    ],
    place: "Begins the Joseph narrative that will bring the family to Egypt and fulfill earlier predictions."
  },
  "gen.38": {
    outline: [
      "1–30: Judah and Tamar; the birth of Perez and Zerah."
    ],
    place: "Interlude showing Judah's line (from which the Messiah will come) and moral failure."
  },
  "gen.39": {
    outline: [
      "1–23: Joseph prospers in Potiphar's house; resists temptation; is falsely accused and imprisoned; God is with him."
    ],
    place: "Joseph's integrity under trial and God's presence in Egypt."
  },
  "gen.40": {
    outline: [
      "1–23: Joseph interprets the dreams of the butler and baker; the butler forgets him."
    ],
    place: "Joseph's gift is used; delay before promotion."
  },
  "gen.41": {
    outline: [
      "1–57: Pharaoh's dreams; Joseph interprets and is exalted; prepares Egypt for famine; Joseph's sons born."
    ],
    place: "Joseph rises to power and becomes the instrument of preservation for many, including his own family."
  },
  "gen.42": {
    outline: [
      "1–38: The brothers' first journey to Egypt for food; Joseph recognizes them; Simeon is held; Jacob refuses to send Benjamin."
    ],
    place: "The beginning of the brothers' testing and recognition of past guilt."
  },
  "gen.43": {
    outline: [
      "1–34: Second journey with Benjamin; Joseph's feast with his brothers."
    ],
    place: "Continued testing and the brothers' growing responsibility for Benjamin."
  },
  "gen.44": {
    outline: [
      "1–34: The silver cup; Judah's intercession for Benjamin."
    ],
    place: "Climax of the test; Judah's change of heart is evident."
  },
  "gen.45": {
    outline: [
      "1–28: Joseph reveals himself; urges the family to come to Egypt; Pharaoh's invitation; Jacob's spirit revives."
    ],
    place: "Reconciliation and the revelation of God's larger purpose in the brothers' earlier evil."
  },
  "gen.46": {
    outline: [
      "1–34: Jacob goes to Egypt; list of those who went; reunion with Joseph."
    ],
    place: "The family of Israel moves to Egypt, beginning the sojourn predicted in chapter 15."
  },
  "gen.47": {
    outline: [
      "1–31: Joseph presents his family to Pharaoh; the famine years; Jacob's request to be buried in Canaan."
    ],
    place: "Settlement in Goshen and the preservation of the family through the famine."
  },
  "gen.48": {
    outline: [
      "1–22: Jacob blesses Ephraim and Manasseh, crossing his hands; adopts them as his own."
    ],
    place: "Blessing of Joseph's sons and the elevation of Ephraim."
  },
  "gen.49": {
    outline: [
      "1–28: Jacob's prophetic blessings on his twelve sons.",
      "29–33: Jacob's death instructions and death."
    ],
    place: "Final words over the tribes and the end of Jacob's life."
  },
  "gen.50": {
    outline: [
      "1–14: Jacob's burial in Canaan.",
      "15–21: The brothers fear Joseph; Joseph reassures them of God's good purpose.",
      "22–26: Joseph's last days; the charge concerning his bones; Joseph dies."
    ],
    place: "Closes Genesis with burial in the land of promise and the hope of return; the stage is set for Exodus."
  }
};

/**
 * Return context for the given book and chapter.
 * Always returns an object with purpose, themes, outline, place.
 * Falls back gracefully when chapter-specific data is absent.
 */
export function getChapterContext(bookId, chapterNum) {
  const id = String(bookId || "").toLowerCase();
  const ch = Number(chapterNum) || 1;
  const meta = BOOK_META[id] || {
    purpose: "This book is part of the public-domain King James Version. Open a chapter to read the text itself.",
    themes: ["Scripture"]
  };

  const key = id + "." + ch;
  const specific = CHAPTER_DATA[key];

  let outline;
  let place;

  if (specific) {
    outline = specific.outline;
    place = specific.place;
  } else {
    outline = [
      "This is chapter " + ch + " of the book.",
      "Read the verses themselves for the sequence of events, teaching, or poetry.",
      "Detailed chapter outlines are currently provided for Genesis; other books receive book-level context only."
    ];
    place = "Chapter " + ch + " sits within the larger flow of this book. The book's overall purpose and themes (above) still apply.";
  }

  return {
    purpose: meta.purpose,
    themes: Array.isArray(meta.themes) ? meta.themes.slice() : [],
    outline: Array.isArray(outline) ? outline.slice() : [String(outline || "")],
    place: place || ""
  };
}
