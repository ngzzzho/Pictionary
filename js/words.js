'use strict';

// Word bank for Pictionary Party.
// To add a topic: add a key with { label, emoji, words } — the app picks it
// up automatically, including in the Mixed deck.
const WORD_BANK = {
  animals: {
    label: 'Animals',
    emoji: '🐾',
    words: [
      'dog', 'cat', 'rabbit', 'hamster', 'mouse', 'squirrel', 'hedgehog',
      'fox', 'wolf', 'bear', 'polar bear', 'panda', 'koala', 'kangaroo',
      'monkey', 'gorilla', 'sloth', 'elephant', 'giraffe', 'zebra', 'lion',
      'tiger', 'leopard', 'rhinoceros', 'hippo', 'camel', 'deer', 'moose',
      'horse', 'donkey', 'cow', 'sheep', 'goat', 'pig', 'chicken', 'rooster',
      'duck', 'goose', 'turkey', 'owl', 'eagle', 'parrot', 'penguin',
      'flamingo', 'ostrich', 'peacock', 'swan', 'bat', 'snake', 'lizard',
      'chameleon', 'crocodile', 'turtle', 'frog', 'dinosaur', 'shark',
      'whale', 'dolphin', 'seal', 'walrus', 'octopus', 'squid', 'jellyfish',
      'crab', 'lobster', 'seahorse', 'starfish', 'snail', 'butterfly',
      'caterpillar', 'bee', 'ant', 'spider', 'ladybug', 'mosquito', 'worm',
    ],
  },

  occupations: {
    label: 'Occupations',
    emoji: '💼',
    words: [
      'doctor', 'nurse', 'dentist', 'surgeon', 'pharmacist', 'veterinarian',
      'teacher', 'professor', 'scientist', 'astronaut', 'pilot',
      'flight attendant', 'sailor', 'ship captain', 'soldier', 'firefighter',
      'police officer', 'detective', 'spy', 'judge', 'lawyer', 'chef',
      'baker', 'butcher', 'waiter', 'barista', 'farmer', 'fisherman',
      'gardener', 'florist', 'carpenter', 'plumber', 'electrician',
      'mechanic', 'engineer', 'architect', 'construction worker', 'miner',
      'blacksmith', 'beekeeper', 'painter', 'sculptor', 'photographer',
      'journalist', 'news anchor', 'writer', 'actor', 'singer', 'dancer',
      'ballerina', 'musician', 'conductor', 'DJ', 'magician', 'clown',
      'acrobat', 'referee', 'coach', 'lifeguard', 'taxi driver',
      'bus driver', 'train driver', 'delivery rider', 'mail carrier',
      'librarian', 'hairdresser', 'barber', 'tailor', 'shoemaker',
      'cashier', 'zookeeper', 'security guard', 'janitor', 'programmer',
      'youtuber',
    ],
  },

  sports: {
    label: 'Sports',
    emoji: '⚽',
    words: [
      'soccer', 'basketball', 'baseball', 'tennis', 'table tennis',
      'badminton', 'volleyball', 'handball', 'dodgeball', 'golf', 'bowling',
      'billiards', 'darts', 'archery', 'fencing', 'boxing', 'karate',
      'judo', 'taekwondo', 'kung fu', 'wrestling', 'sumo wrestling',
      'weightlifting', 'gymnastics', 'trampoline', 'yoga', 'running',
      'marathon', 'hurdles', 'high jump', 'long jump', 'pole vault',
      'javelin', 'shot put', 'discus', 'cycling', 'skateboarding',
      'roller skating', 'surfing', 'swimming', 'diving', 'water polo',
      'sailing', 'rowing', 'kayaking', 'fishing', 'ice skating',
      'figure skating', 'ice hockey', 'skiing', 'snowboarding', 'sledding',
      'curling', 'rock climbing', 'hiking', 'horse riding', 'cricket',
      'rugby', 'american football', 'frisbee', 'tug of war', 'jump rope',
      'hula hoop', 'chess', 'parkour', 'scuba diving', 'car racing',
    ],
  },
};
