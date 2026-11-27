/**
 * Built-in lists of the pseudonymisation (PSEUDO-008, PSEUDO-010,
 * PSEUDO-011). The user adds to them; nothing here is personal data.
 */

/** PSEUDO-010: names of scientists and units, never replaced alone. */
export const EXCLUSIONS: readonly string[] = [
  'Ampère', 'Archimède', 'Avogadro', 'Bernoulli', 'Bessel', 'Bézier', 'Biot', 'Black', 'Bode', 'Bohr', 'Boltzmann',
  'Boole', 'Brinell', 'Butterworth', 'Carnot', 'Castigliano', 'Cauchy', 'Celsius', 'Charles', 'Charpy', 'Chebyshev',
  'Clapeyron', 'Coulomb', 'Curie', "d'Alembert", 'Darcy', 'Descartes', 'Dirac', 'Doppler', 'Einstein', 'Euler',
  'Faraday', 'Fermat', 'Fibonacci', 'Fick', 'Fourier', 'Fresnel', 'Galilée', 'Gauss', 'Goodman', 'Hall', 'Hamilton',
  'Hamming', 'Heisenberg', 'Henry', 'Hertz', 'Hooke', 'Hurwitz', 'Huygens', 'Joule', 'Kalman', 'Kelvin', 'Kepler',
  'Kirchhoff', 'Lagrange', 'Lamé', 'Laplace', 'Leibniz', 'Lenz', 'Lorentz', 'Lyapunov', 'Mach', 'Maxwell', 'Miner',
  'Mohr', 'Navier', 'Nernst', 'Newton', 'Nichols', 'Norton', 'Nyquist', 'Ohm', 'Pascal', 'Planck', 'Poisson',
  'Prandtl', 'Pythagore', 'Rankine', 'Reynolds', 'Riemann', 'Rockwell', 'Routh', 'Saint-Venant', 'Schrödinger',
  'Shannon', 'Siemens', 'Smith', 'Snell', 'Stokes', 'Taylor', 'Tesla', 'Thalès', 'Thévenin', 'Timoshenko', 'Tresca',
  'Venturi', 'Vickers', 'Volta', 'von Mises', 'Watt', 'Weber', 'Weibull', 'Wöhler', 'Young', 'Ziegler',
];

/**
 * PSEUDO-011: French words that are also family names. A name of the list
 * found here (or written in lower case in the documents) is replaced alone
 * only next to a first name, an initial or a label.
 */
export const COMMON_WORDS_FR: readonly string[] = [
  'Abbé', 'Amour', 'Ange', 'Arbre', 'Avril', 'Baron', 'Barre', 'Barbier', 'Bas', 'Basset', 'Beau',
  'Bel', 'Belle', 'Berger', 'Bise', 'Blanc', 'Bois', 'Bon', 'Bonheur', 'Bonnet',
  'Bouche', 'Boucher', 'Boulanger', 'Bourgeois', 'Bouvier', 'Brun', 'Bureau', 'Caillou', 'Camus', 'Carré',
  'Chapelle', 'Charbonnier', 'Charpentier', 'Chasseur', 'Chat', 'Chauvin', 'Chemin', 'Chevalier',
  'Chêne', 'Clair', 'Clerc', 'Colin', 'Comte', 'Cordier', 'Courtois', 'Cousin', 'Couturier', 'Croix',
  'Dame', 'Doux', 'Droit', 'Écuyer', 'Faucheur',
  'Fleur', 'Fontaine', 'Force', 'Forest', 'Fort', 'Franc', 'Gaillard', 'Garde', 'Gentil', 'Grand',
  'Gras', 'Gros', 'Guerre', 'Hiver', 'Jardin', 'Jeune', 'Juge', 'Large',
  'Lion',
  'Long', 'Loup', 'Maçon', 'Maire', 'Maître', 'Maréchal', 'Marchand', 'Marin', 'Mars', 'Masse', 'Mercier',
  'Meunier', 'Mineur', 'Moine', 'Mouton', 'Moulin', 'Mur', 'Neveu', 'Noble', 'Noir', 'Noël',
  'Page', 'Paris', 'Pasteur', 'Pêcheur', 'Petit', 'Picard', 'Pierre', 'Pin', 'Poirier', 'Pont', 'Porte',
  'Potier', 'Poulain', 'Prince', 'Prieur', 'Riche', 'Rivière', 'Roche', 'Roi', 'Rose', 'Rousseau', 'Roux',
  'Sage', 'Saint', 'Sauvage', 'Seigneur', 'Soleil', 'Tailleur', 'Tanneur', 'Tisserand',
  'Tonnelier', 'Tour', 'Vache', 'Vallée', 'Verdier', 'Vert', 'Vigneron', 'Voisin',
];

/**
 * PSEUDO-008: labels followed by names. Folded when used; "(s)" and "(e)"
 * endings are accepted after any of them.
 */
export const LABELS: readonly string[] = [
  'nom', 'noms', 'prénom', 'prénoms', 'nom et prénom', 'nom prénom', 'prénom nom', 'nom de famille', 'auteur', 'auteurs',
  'autrice', 'rédigé par', 'réalisé par', 'présenté par', 'fait par', 'écrit par', 'binôme', 'binômes', 'trinôme',
  'groupe', 'équipe', 'membres', 'contact', 'responsable', 'name', 'names', 'first name', 'last name', 'surname',
  'given name', 'author', 'authors', 'written by', 'presented by', 'made by', 'members', 'team',
];

/** Labels after which no colon is needed ("Présenté par Maëlle Le Gall"). */
export const BY_LABELS: readonly string[] = ['rédigé par', 'réalisé par', 'présenté par', 'fait par', 'écrit par', 'written by', 'presented by', 'made by'];
