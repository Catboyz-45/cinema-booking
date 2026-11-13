// Movie Database with full details
const moviesDatabase = {
    'death-whisperer-2': {
        id: 'death-whisperer-2',
        titleThai: 'ธี่หยด 2',
        titleEng: 'Death Whisperer 2',
        genres: ['สยองขวัญ', 'Thriller'],
        duration: '2 ชม. 5 นาที',
        rating: '4.8',
        reviews: '12.5k',
        releaseDate: '24 Oct 2024',
        ageLimit: '15+',
        backdropImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuASMj5eZTFJZJs9CywraW3SS7EjRRxBBEHqp-Y19NWauJrymZaNn1rXaEBcJQPTmnFDhF7-p6IIwNd7AQa6xtFWoImsrofyxVANdSPqev0LFMGsYGtKLktvAmYxrQAh7SAmvSUcuhxed8VZqLbtnuVBw9ocFdQcmk0jMeZlAJDbIk3YjSTlLfLNvQWmrF_OisbgJslncTjKUzc3oTfExAOGztOdWazgvwZYKGiLfTAsGiHOAPFMZ5QUH',
        trailerImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDyWgC4UyWziyzpvGycmmrFcXTSS5aq4jSUnwBdTIjLplvd3mUe3Fi0fnEEH7FPiW53M7IPURk4T5B1Pz8y3Hrb-HzQnIXXjPPPDH0O_OiPjIi3-MLddIU-KFHdQmU',
        description: 'ยักษ์ออกตามล่าวิญญาณร้ายที่พรากชีวิตน้องสาว เพื่อปกป้องครอบครัวจากเสียงกระซิบปริศนาที่ยังวนเวียนอยู่ในหมู่บ้าน',
        showtimes: [
            {
                cinema: 'Paragon Cineplex',
                distance: '1.2 km away',
                amenities: ['Parking', 'Food'],
                systems: [
                    {
                        format: 'IMAX',
                        type: 'Laser 2D • Thai Audio / Eng Sub',
                        times: [
                            { time: '10:30', hall: 'Hall 1' },
                            { time: '13:45', hall: 'Hall 1' },
                            { time: '17:00', hall: 'Hall 1' },
                            { time: '20:15', hall: 'Hall 1' }
                        ]
                    },
                    {
                        format: 'Digital 2D',
                        type: 'Thai Audio',
                        times: [
                            { time: '11:00', hall: 'Hall 4' },
                            { time: '14:20', hall: 'Hall 4' },
                            { time: '16:40', hall: 'Hall 6' },
                            { time: '19:00', hall: 'Hall 4' },
                            { time: '22:00', hall: 'Hall 4' }
                        ]
                    }
                ]
            },
            {
                cinema: 'Major Cineplex Sukhumvit',
                distance: '3.5 km away',
                amenities: ['Parking', 'Food', 'WiFi'],
                systems: [
                    {
                        format: 'VIP Class',
                        type: 'Thai Audio / Eng Sub',
                        times: [
                            { time: '12:00', hall: 'Theater 1' },
                            { time: '15:30', hall: 'Theater 1' }
                        ]
                    }
                ]
            }
        ],
        cast: [
            {
                name: 'Nadech Kugimiya',
                role: 'Yak',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDztgQDczUzIVc52GWs63FgACO2p6azHhcIW5dgB8qmysQM6j5-rFtRm_pfg7nZ9fTKWyRz-XXKkJabGtW3Ua0'
            },
            {
                name: 'Denise Jelilcha',
                role: 'Yad',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDkIsD3s0rk3_ewVSn0FhMjYhkExgvxlS6KNKZ_ZwEzd6zbZAwbGoKAuYaPHFkivNdS2VcbvJfaRvmzTIFQaENDjuqT3WFcgH-IGwmgcj8TSrh16'
            },
            {
                name: 'Rattanawadee',
                role: 'Yam',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCoSYkuFWmECjUd6tfhu4buOztBX16Cp8AtlE789NKwUcGcF-b7UQudeAYmSQ0vKB6xNajHDEmQMKgEfaPt1X-_BH_JDFAksrN44BfISI0Ie9h3naMCoFqwz0'
            }
        ]
    },
    'the-marvels': {
        id: 'the-marvels',
        titleThai: 'The Marvels',
        titleEng: 'The Marvels',
        genres: ['แอ็คชัน', 'Adventure'],
        duration: '1 ชม. 45 นาที',
        rating: '7.5',
        reviews: '8.2k',
        releaseDate: '20 Oct 2024',
        ageLimit: 'G',
        backdropImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC4LF9j0wT5oJ1xXpQ2z9KqL3m4MdN7p2s8t0r5vW6a7bXyZ0cDeFgHiJkL1mNoPqRsT',
        trailerImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC4LF9j0wT5oJ1xXpQ2z9KqL3m4MdN7p2s8t0r5',
        description: 'นักสู้ซูเปอร์ฮีโร่ทั้งสามจัดการกับศัตรูที่ยากจะต่อต้าน พวกเขาต้องทำงานร่วมกันเพื่อปกป้องโลก',
        showtimes: [
            {
                cinema: 'Icon Siam Cineplex',
                distance: '2.1 km away',
                amenities: ['Parking', 'Food'],
                systems: [
                    {
                        format: 'IMAX',
                        type: 'Laser 2D • Thai Audio / Eng Sub',
                        times: [
                            { time: '11:00', hall: 'Hall 2' },
                            { time: '14:00', hall: 'Hall 2' },
                            { time: '17:30', hall: 'Hall 2' },
                            { time: '20:00', hall: 'Hall 2' }
                        ]
                    },
                    {
                        format: '4DX',
                        type: 'Thai Audio / Eng Sub',
                        times: [
                            { time: '12:30', hall: 'Hall 5' },
                            { time: '15:45', hall: 'Hall 5' },
                            { time: '18:15', hall: 'Hall 5' },
                            { time: '21:00', hall: 'Hall 5' }
                        ]
                    }
                ]
            },
            {
                cinema: 'Major Cineplex Ratchayothin',
                distance: '4.2 km away',
                amenities: ['Parking', 'Food', 'WiFi'],
                systems: [
                    {
                        format: 'Standard 2D',
                        type: 'Thai Audio',
                        times: [
                            { time: '13:00', hall: 'Hall 3' },
                            { time: '16:00', hall: 'Hall 3' },
                            { time: '19:00', hall: 'Hall 3' }
                        ]
                    }
                ]
            }
        ],
        cast: [
            {
                name: 'Brie Larson',
                role: 'Captain Marvel',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD0brie1Larson0Captain0Marvel'
            },
            {
                name: 'Teyonah Parris',
                role: 'Monica Rambeau',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDT3yonah0Parris0Monica0Rambeau'
            },
            {
                name: 'Iman Vellani',
                role: 'Kamala Khan',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDI0man0Vellani0Kamala0Khan'
            },
            {
                name: 'Samuel L. Jackson',
                role: 'Nick Fury',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDS0amuel0L0Jackson0Nick0Fury'
            }
        ]
    },
    'hunger-games': {
        id: 'hunger-games',
        titleThai: 'Hunger Games',
        titleEng: 'The Hunger Games',
        genres: ['แอ็คชัน', 'ดราม่า'],
        duration: '2 ชม. 38 นาที',
        rating: '8.8',
        reviews: '15.3k',
        releaseDate: '18 Oct 2024',
        ageLimit: '13+',
        backdropImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD7hunger0Games0backdrop00',
        trailerImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD7hunger0Games0trailer00',
        description: 'เด็กสาวจากเขตที่ยากจนที่สุดอาสาเข้าร่วมเกมเอาชีวิตรอดแทนน้องสาว และต้องใช้ทั้งไหวพริบและความกล้าหาญเพื่อกลับบ้าน',
        showtimes: [
            {
                cinema: 'Paragon Cineplex',
                distance: '1.2 km away',
                amenities: ['Parking', 'Food'],
                systems: [
                    {
                        format: '4DX',
                        type: 'Thai Audio / Eng Sub',
                        times: [
                            { time: '10:00', hall: 'Hall 3' },
                            { time: '13:00', hall: 'Hall 3' },
                            { time: '16:30', hall: 'Hall 3' },
                            { time: '19:30', hall: 'Hall 3' }
                        ]
                    },
                    {
                        format: 'Standard 2D',
                        type: 'Thai Audio',
                        times: [
                            { time: '11:30', hall: 'Hall 7' },
                            { time: '14:45', hall: 'Hall 7' },
                            { time: '18:00', hall: 'Hall 7' },
                            { time: '21:15', hall: 'Hall 7' }
                        ]
                    }
                ]
            }
        ],
        cast: [
            {
                name: 'Jennifer Lawrence',
                role: 'Katniss Everdeen',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDJ0ennifer0Lawrence0Katniss'
            },
            {
                name: 'Josh Hutcherson',
                role: 'Peeta Mellark',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDJ0osh0Hutcherson0Peeta'
            },
            {
                name: 'Liam Hemsworth',
                role: 'Gale Hawthorne',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDL0iam0Hemsworth0Gale'
            },
            {
                name: 'Woody Harrelson',
                role: 'Haymitch Abernathy',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDW0oody0Harrelson0Haymitch'
            }
        ]
    },
    'killers-of-the-flower-moon': {
        id: 'killers-of-the-flower-moon',
        titleThai: 'Killers of the Flower Moon',
        titleEng: 'Killers of the Flower Moon',
        genres: ['ดราม่า', 'Crime'],
        duration: '3 ชม. 26 นาที',
        rating: '9.0',
        reviews: '18.7k',
        releaseDate: '22 Oct 2024',
        ageLimit: '18+',
        backdropImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC5LDqEhChXP-vKH3QfaFy2-3NiwsDGow2GuUO3vq5mAbu9JUt7',
        trailerImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC5LDq0Killers0Flower0Moon0',
        description: 'เมื่อพบน้ำมันบนผืนดินของชาวโอเซจในทศวรรษ 1920 การฆาตกรรมปริศนาก็เริ่มขึ้น และการสืบสวนได้เปิดโปงความโลภของผู้มีอำนาจ',
        showtimes: [
            {
                cinema: 'Major Cineplex Sukhumvit',
                distance: '3.5 km away',
                amenities: ['Parking', 'Food', 'WiFi'],
                systems: [
                    {
                        format: 'Standard 2D',
                        type: 'Eng Sub',
                        times: [
                            { time: '10:30', hall: 'Theater 4' },
                            { time: '13:45', hall: 'Theater 4' },
                            { time: '17:15', hall: 'Theater 4' },
                            { time: '20:30', hall: 'Theater 4' }
                        ]
                    }
                ]
            }
        ],
        cast: [
            {
                name: 'Leonardo DiCaprio',
                role: 'Ernest Burkhart',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDL0eonardo0DiCaprio0Ernest'
            },
            {
                name: 'Robert De Niro',
                role: 'William K. Hale',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDR0obert0De0Niro0William'
            },
            {
                name: 'Lily Gladstone',
                role: 'Mollie Kyle',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDL0ily0Gladstone0Mollie'
            }
        ]
    },
    'trolls-band-together': {
        id: 'trolls-band-together',
        titleThai: 'Trolls Band Together',
        titleEng: 'Trolls Band Together',
        genres: ['แอนิเมชัน', 'Comedy'],
        duration: '1 ชม. 32 นาที',
        rating: '7.0',
        reviews: '9.5k',
        releaseDate: '15 Oct 2024',
        ageLimit: 'G',
        backdropImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAERj7xQVsl0tyNLugPr8wpKU9VHDPlA6FU',
        trailerImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAERj7xQVsl0tyNLugPr8wpKU9VHDPlA6FU',
        description: 'บรันช์และป๊อปปี้ออกเดินทางรวมวงพี่น้องอีกครั้ง เพื่อช่วยครอบครัวด้วยพลังของเสียงเพลงและมิตรภาพ',
        showtimes: [
            {
                cinema: 'Icon Siam Cineplex',
                distance: '2.1 km away',
                amenities: ['Parking', 'Food'],
                systems: [
                    {
                        format: 'Standard 2D',
                        type: 'Thai Audio',
                        times: [
                            { time: '09:30', hall: 'Hall 1' },
                            { time: '11:45', hall: 'Hall 1' },
                            { time: '14:00', hall: 'Hall 1' },
                            { time: '16:15', hall: 'Hall 1' },
                            { time: '18:30', hall: 'Hall 1' }
                        ]
                    }
                ]
            },
            {
                cinema: 'Major Cineplex Ratchayothin',
                distance: '4.2 km away',
                amenities: ['Parking', 'Food', 'WiFi'],
                systems: [
                    {
                        format: 'Standard 2D',
                        type: 'Thai Audio',
                        times: [
                            { time: '10:00', hall: 'Theater 2' },
                            { time: '12:30', hall: 'Theater 2' },
                            { time: '15:00', hall: 'Theater 2' },
                            { time: '17:30', hall: 'Theater 2' },
                            { time: '20:00', hall: 'Theater 2' }
                        ]
                    }
                ]
            }
        ],
        cast: [
            {
                name: 'Justin Timberlake',
                role: 'Branch',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDJ0ustin0Timberlake0Branch'
            },
            {
                name: 'Anna Kendrick',
                role: 'Poppy',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDA0nna0Kendrick0Poppy'
            },
            {
                name: 'Zooey Deschanel',
                role: 'Delta Dawn',
                image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDZ0ooey0Deschanel0Delta'
            }
        ]
    }
};

const additionalMovies = {
    'dune-part-two': {
        id: 'dune-part-two',
        titleThai: 'ดูน ภาค 2',
        titleEng: 'Dune: Part Two',
        genres: ['ไซไฟ', 'ผจญภัย'],
        duration: '2 ชม. 46 นาที',
        rating: '8.7',
        reviews: '21.4k',
        releaseDate: '29 Feb 2024',
        ageLimit: '13+',
        backdropImage: 'https://picsum.photos/seed/dune-part-two-bg/1600/900',
        trailerImage: 'https://picsum.photos/seed/dune-part-two-trailer/1280/720',
        description: 'พอล อะเทรดีสรวมพลังกับชาวฟรีเมนเพื่อเผชิญศึกครั้งใหญ่และเปลี่ยนชะตาแห่งอาราคิส',
        showtimes: [{
            cinema: 'Paragon Cineplex',
            distance: '1.2 km away',
            amenities: ['Parking', 'Food', 'WiFi'],
            systems: [{
                format: 'IMAX',
                type: 'TH/EN SUB',
                times: [{ time: '10:20', hall: 'Hall 2' }, { time: '14:10', hall: 'Hall 2' }, { time: '19:00', hall: 'Hall 2' }]
            }]
        }],
        cast: [
            { name: 'Timothée Chalamet', role: 'Paul Atreides', image: 'https://i.pravatar.cc/200?img=11' },
            { name: 'Zendaya', role: 'Chani', image: 'https://i.pravatar.cc/200?img=12' },
            { name: 'Rebecca Ferguson', role: 'Lady Jessica', image: 'https://i.pravatar.cc/200?img=13' }
        ]
    },
    'inside-out-2': {
        id: 'inside-out-2',
        titleThai: 'มหัศจรรย์อารมณ์อลเวง 2',
        titleEng: 'Inside Out 2',
        genres: ['แอนิเมชัน', 'ครอบครัว'],
        duration: '1 ชม. 36 นาที',
        rating: '8.3',
        reviews: '18.9k',
        releaseDate: '14 Jun 2024',
        ageLimit: 'G',
        backdropImage: 'https://picsum.photos/seed/inside-out-2-bg/1600/900',
        trailerImage: 'https://picsum.photos/seed/inside-out-2-trailer/1280/720',
        description: 'ไรลีย์เข้าสู่วัยรุ่นพร้อมอารมณ์ใหม่ที่เข้ามาปั่นป่วนการควบคุมในใจของเธอ',
        showtimes: [{
            cinema: 'Icon Siam Cineplex',
            distance: '2.1 km away',
            amenities: ['Parking', 'Food'],
            systems: [{
                format: 'Digital 2D',
                type: 'Thai Dub / EN SUB',
                times: [{ time: '11:00', hall: 'Hall 1' }, { time: '13:20', hall: 'Hall 1' }, { time: '16:10', hall: 'Hall 1' }]
            }]
        }],
        cast: [
            { name: 'Amy Poehler', role: 'Joy', image: 'https://i.pravatar.cc/200?img=21' },
            { name: 'Maya Hawke', role: 'Anxiety', image: 'https://i.pravatar.cc/200?img=22' },
            { name: 'Phyllis Smith', role: 'Sadness', image: 'https://i.pravatar.cc/200?img=23' }
        ]
    },
    'kung-fu-panda-4': {
        id: 'kung-fu-panda-4',
        titleThai: 'กังฟูแพนด้า 4',
        titleEng: 'Kung Fu Panda 4',
        genres: ['แอนิเมชัน', 'แอ็คชัน'],
        duration: '1 ชม. 34 นาที',
        rating: '7.9',
        reviews: '11.1k',
        releaseDate: '8 Mar 2024',
        ageLimit: 'G',
        backdropImage: 'https://picsum.photos/seed/kfp4-bg/1600/900',
        trailerImage: 'https://picsum.photos/seed/kfp4-trailer/1280/720',
        description: 'โปต้องสอนทายาทนักรบมังกรคนใหม่ พร้อมเผชิญภัยจากวายร้ายผู้เปลี่ยนร่าง',
        showtimes: [{
            cinema: 'Major Cineplex Ratchayothin',
            distance: '4.2 km away',
            amenities: ['Parking', 'Food', 'WiFi'],
            systems: [{
                format: 'Digital 2D',
                type: 'Thai Dub',
                times: [{ time: '10:40', hall: 'Hall 6' }, { time: '13:00', hall: 'Hall 6' }, { time: '15:30', hall: 'Hall 6' }]
            }]
        }],
        cast: [
            { name: 'Jack Black', role: 'Po', image: 'https://i.pravatar.cc/200?img=31' },
            { name: 'Awkwafina', role: 'Zhen', image: 'https://i.pravatar.cc/200?img=32' },
            { name: 'Viola Davis', role: 'The Chameleon', image: 'https://i.pravatar.cc/200?img=33' }
        ]
    },
    'godzilla-x-kong': {
        id: 'godzilla-x-kong',
        titleThai: 'ก็อดซิลล่า ปะทะ คอง',
        titleEng: 'Godzilla x Kong: The New Empire',
        genres: ['แอ็คชัน', 'ไซไฟ'],
        duration: '1 ชม. 55 นาที',
        rating: '7.6',
        reviews: '13.8k',
        releaseDate: '29 Mar 2024',
        ageLimit: '13+',
        backdropImage: 'https://picsum.photos/seed/gxk-bg/1600/900',
        trailerImage: 'https://picsum.photos/seed/gxk-trailer/1280/720',
        description: 'เมื่อภัยใหม่จากโลกโพรงลึกปรากฏขึ้น ไททันทั้งสองต้องจับมือกันเพื่อปกป้องโลก',
        showtimes: [{
            cinema: 'Paragon Cineplex',
            distance: '1.2 km away',
            amenities: ['Parking', 'Food'],
            systems: [{
                format: '4DX',
                type: 'TH/EN SUB',
                times: [{ time: '12:15', hall: 'Hall 3' }, { time: '15:00', hall: 'Hall 3' }, { time: '20:20', hall: 'Hall 3' }]
            }]
        }],
        cast: [
            { name: 'Rebecca Hall', role: 'Ilene Andrews', image: 'https://i.pravatar.cc/200?img=41' },
            { name: 'Brian Tyree Henry', role: 'Bernie', image: 'https://i.pravatar.cc/200?img=42' },
            { name: 'Dan Stevens', role: 'Trapper', image: 'https://i.pravatar.cc/200?img=43' }
        ]
    },
    'deadpool-wolverine': {
        id: 'deadpool-wolverine',
        titleThai: 'เดดพูล & วูล์ฟเวอรีน',
        titleEng: 'Deadpool & Wolverine',
        genres: ['แอ็คชัน', 'คอมเมดี้'],
        duration: '2 ชม. 7 นาที',
        rating: '8.5',
        reviews: '24.2k',
        releaseDate: '26 Jul 2024',
        ageLimit: '18+',
        backdropImage: 'https://picsum.photos/seed/dw-bg/1600/900',
        trailerImage: 'https://picsum.photos/seed/dw-trailer/1280/720',
        description: 'เดดพูลถูกดึงเข้าสู่ภารกิจวุ่นวายข้ามจักรวาลและต้องร่วมมือกับวูล์ฟเวอรีน',
        showtimes: [{
            cinema: 'Major Cineplex Sukhumvit',
            distance: '3.5 km away',
            amenities: ['Parking', 'Food', 'WiFi'],
            systems: [{
                format: 'IMAX',
                type: 'TH/EN SUB',
                times: [{ time: '11:30', hall: 'Hall 5' }, { time: '16:20', hall: 'Hall 5' }, { time: '21:10', hall: 'Hall 5' }]
            }]
        }],
        cast: [
            { name: 'Ryan Reynolds', role: 'Deadpool', image: 'https://i.pravatar.cc/200?img=51' },
            { name: 'Hugh Jackman', role: 'Wolverine', image: 'https://i.pravatar.cc/200?img=52' },
            { name: 'Emma Corrin', role: 'Cassandra Nova', image: 'https://i.pravatar.cc/200?img=53' }
        ]
    },
    'despicable-me-4': {
        id: 'despicable-me-4',
        titleThai: 'มินเนี่ยน 4',
        titleEng: 'Despicable Me 4',
        genres: ['แอนิเมชัน', 'คอมเมดี้'],
        duration: '1 ชม. 34 นาที',
        rating: '7.4',
        reviews: '10.3k',
        releaseDate: '3 Jul 2024',
        ageLimit: 'G',
        backdropImage: 'https://picsum.photos/seed/dm4-bg/1600/900',
        trailerImage: 'https://picsum.photos/seed/dm4-trailer/1280/720',
        description: 'ครอบครัวของกรูต้องเผชิญวายร้ายคนใหม่ พร้อมความป่วนระดับมินเนี่ยน',
        showtimes: [{
            cinema: 'Icon Siam Cineplex',
            distance: '2.1 km away',
            amenities: ['Parking', 'Food'],
            systems: [{
                format: 'Digital 2D',
                type: 'Thai Dub',
                times: [{ time: '09:50', hall: 'Hall 4' }, { time: '12:10', hall: 'Hall 4' }, { time: '14:30', hall: 'Hall 4' }]
            }]
        }],
        cast: [
            { name: 'Steve Carell', role: 'Gru', image: 'https://i.pravatar.cc/200?img=61' },
            { name: 'Kristen Wiig', role: 'Lucy', image: 'https://i.pravatar.cc/200?img=62' },
            { name: 'Pierre Coffin', role: 'Minions', image: 'https://i.pravatar.cc/200?img=63' }
        ]
    },
    wicked: {
        id: 'wicked',
        titleThai: 'วิคเค็ด',
        titleEng: 'Wicked',
        genres: ['แฟนตาซี', 'มิวสิคัล'],
        duration: '2 ชม. 40 นาที',
        rating: '8.1',
        reviews: '9.6k',
        releaseDate: '22 Nov 2024',
        ageLimit: 'G',
        backdropImage: 'https://picsum.photos/seed/wicked-bg/1600/900',
        trailerImage: 'https://picsum.photos/seed/wicked-trailer/1280/720',
        description: 'เรื่องราวก่อนพ่อมดแห่งออซ เมื่อเอลฟาบาและกลินดาพบมิตรภาพที่เปลี่ยนโชคชะตา',
        showtimes: [{
            cinema: 'Paragon Cineplex',
            distance: '1.2 km away',
            amenities: ['Parking', 'Food'],
            systems: [{
                format: 'Dolby Atmos',
                type: 'EN SUB',
                times: [{ time: '10:50', hall: 'Hall 8' }, { time: '15:10', hall: 'Hall 8' }, { time: '19:40', hall: 'Hall 8' }]
            }]
        }],
        cast: [
            { name: 'Cynthia Erivo', role: 'Elphaba', image: 'https://i.pravatar.cc/200?img=71' },
            { name: 'Ariana Grande', role: 'Glinda', image: 'https://i.pravatar.cc/200?img=72' },
            { name: 'Jonathan Bailey', role: 'Fiyero', image: 'https://i.pravatar.cc/200?img=73' }
        ]
    },
    'gladiator-2': {
        id: 'gladiator-2',
        titleThai: 'แกลดิเอเตอร์ 2',
        titleEng: 'Gladiator II',
        genres: ['แอ็คชัน', 'ดราม่า'],
        duration: '2 ชม. 28 นาที',
        rating: '8.0',
        reviews: '7.2k',
        releaseDate: '15 Nov 2024',
        ageLimit: '16+',
        backdropImage: 'https://picsum.photos/seed/gladiator2-bg/1600/900',
        trailerImage: 'https://picsum.photos/seed/gladiator2-trailer/1280/720',
        description: 'สังเวียนนักรบกลับมาอีกครั้งกับศึกอำนาจแห่งจักรวรรดิโรมที่โหดเหี้ยมกว่าเดิม',
        showtimes: [{
            cinema: 'Major Cineplex Sukhumvit',
            distance: '3.5 km away',
            amenities: ['Parking', 'Food', 'WiFi'],
            systems: [{
                format: 'Standard 2D',
                type: 'EN SUB',
                times: [{ time: '12:40', hall: 'Theater 3' }, { time: '17:00', hall: 'Theater 3' }, { time: '20:40', hall: 'Theater 3' }]
            }]
        }],
        cast: [
            { name: 'Paul Mescal', role: 'Lucius', image: 'https://i.pravatar.cc/200?img=81' },
            { name: 'Pedro Pascal', role: 'Marcus', image: 'https://i.pravatar.cc/200?img=82' },
            { name: 'Denzel Washington', role: 'Macrinus', image: 'https://i.pravatar.cc/200?img=83' }
        ]
    },
    'moana-2': {
        id: 'moana-2',
        titleThai: 'โมอาน่า 2',
        titleEng: 'Moana 2',
        genres: ['แอนิเมชัน', 'ผจญภัย'],
        duration: '1 ชม. 40 นาที',
        rating: '7.8',
        reviews: '8.4k',
        releaseDate: '27 Nov 2024',
        ageLimit: 'G',
        backdropImage: 'https://picsum.photos/seed/moana2-bg/1600/900',
        trailerImage: 'https://picsum.photos/seed/moana2-trailer/1280/720',
        description: 'โมอาน่าออกเดินทางครั้งใหม่สู่มหาสมุทรไกลโพ้นเพื่อแก้ปริศนาแห่งบรรพชน',
        showtimes: [{
            cinema: 'Icon Siam Cineplex',
            distance: '2.1 km away',
            amenities: ['Parking', 'Food'],
            systems: [{
                format: 'Digital 2D',
                type: 'Thai Dub / EN SUB',
                times: [{ time: '10:30', hall: 'Hall 7' }, { time: '13:10', hall: 'Hall 7' }, { time: '15:50', hall: 'Hall 7' }]
            }]
        }],
        cast: [
            { name: 'Auliʻi Cravalho', role: 'Moana', image: 'https://i.pravatar.cc/200?img=91' },
            { name: 'Dwayne Johnson', role: 'Maui', image: 'https://i.pravatar.cc/200?img=92' },
            { name: 'Temuera Morrison', role: 'Chief Tui', image: 'https://i.pravatar.cc/200?img=93' }
        ]
    },
    'a-minecraft-movie': {
        id: 'a-minecraft-movie',
        titleThai: 'ไมน์คราฟต์ เดอะมูฟวี่',
        titleEng: 'A Minecraft Movie',
        genres: ['ผจญภัย', 'คอมเมดี้'],
        duration: '1 ชม. 49 นาที',
        rating: '7.2',
        reviews: '6.7k',
        releaseDate: '4 Apr 2025',
        ageLimit: 'G',
        backdropImage: 'https://picsum.photos/seed/minecraft-movie-bg/1600/900',
        trailerImage: 'https://picsum.photos/seed/minecraft-movie-trailer/1280/720',
        description: 'การผจญภัยในโลกบล็อกที่เต็มไปด้วยสิ่งมีชีวิตสุดป่วนและภารกิจสุดท้าทาย',
        showtimes: [{
            cinema: 'Paragon Cineplex',
            distance: '1.2 km away',
            amenities: ['Parking', 'Food', 'WiFi'],
            systems: [{
                format: 'Digital 2D',
                type: 'Thai Dub / EN SUB',
                times: [{ time: '11:40', hall: 'Hall 9' }, { time: '14:20', hall: 'Hall 9' }, { time: '18:10', hall: 'Hall 9' }]
            }]
        }],
        cast: [
            { name: 'Jason Momoa', role: 'Garrett', image: 'https://i.pravatar.cc/200?img=5' },
            { name: 'Jack Black', role: 'Steve', image: 'https://i.pravatar.cc/200?img=6' },
            { name: 'Emma Myers', role: 'Natalie', image: 'https://i.pravatar.cc/200?img=7' }
        ]
    }
};

Object.assign(moviesDatabase, additionalMovies);

const legacyImageFixes = {
    'death-whisperer-2': {
        backdropImage: 'https://picsum.photos/seed/death-whisperer-2/1600/900',
        trailerImage: 'https://picsum.photos/seed/death-whisperer-2-trailer/1280/720'
    },
    'the-marvels': {
        backdropImage: 'https://picsum.photos/seed/the-marvels/1600/900',
        trailerImage: 'https://picsum.photos/seed/the-marvels-trailer/1280/720'
    },
    'hunger-games': {
        backdropImage: 'https://picsum.photos/seed/hunger-games/1600/900',
        trailerImage: 'https://picsum.photos/seed/hunger-games-trailer/1280/720'
    },
    'killers-of-the-flower-moon': {
        backdropImage: 'https://picsum.photos/seed/killers-of-the-flower-moon/1600/900',
        trailerImage: 'https://picsum.photos/seed/killers-of-the-flower-moon-trailer/1280/720'
    },
    'trolls-band-together': {
        backdropImage: 'https://picsum.photos/seed/trolls-band-together/1600/900',
        trailerImage: 'https://picsum.photos/seed/trolls-band-together-trailer/1280/720'
    }
};

Object.entries(legacyImageFixes).forEach(([movieId, imageData]) => {
    if (moviesDatabase[movieId]) {
        moviesDatabase[movieId] = {
            ...moviesDatabase[movieId],
            ...imageData
        };
    }
});

// Posters come only from images the admin uploads. Without one, the movie's backdrop / trailer image is used,
// and if there is none either, a generated poster (gradient + title) — no outside image service needed.
// (Automatic poster lookups from Wikipedia were removed.)
const BROKEN_IMAGE_HOSTS = /picsum\.photos/i; // old sample placeholders; the service no longer responds

function usableImage(url) {
    return url && !BROKEN_IMAGE_HOSTS.test(url) ? url : null;
}

// ---- generated artwork (used when the admin has not uploaded a picture) ----
// Original vector illustrations drawn in code: a scene that matches the movie's genre plus the title.
// colour variants per genre; each movie gets one of them (picked from its id) so posters of the same genre differ
const POSTER_THEMES = {
    horror: [{ sky: ['#05070d', '#1b2233', '#3b4256'], accent: '#c9d2e3' }, { sky: ['#020a06', '#0f2a1d', '#2f5a43'], accent: '#bfffd8' }, { sky: ['#0d0204', '#2e0a10', '#5a1a22'], accent: '#ffc2c2' }],
    action: [{ sky: ['#1a0905', '#6b1d0c', '#f0782f'], accent: '#ffb35c' }, { sky: ['#020c14', '#0b3550', '#38a3c9'], accent: '#9ee7ff' }, { sky: ['#14030a', '#5c0b22', '#e2425f'], accent: '#ff9aa8' }],
    toon: [{ sky: ['#7cc8ff', '#c8e8ff', '#ffe1ef'], accent: '#ff6fa8' }, { sky: ['#5fd3b5', '#d8fff1', '#fff3c4'], accent: '#ffb84d' }, { sky: ['#a58bff', '#e3dbff', '#ffe0f0'], accent: '#ff7fbf' }],
    scifi: [{ sky: ['#03030f', '#0d1440', '#3a2a7a'], accent: '#7fe7ff' }, { sky: ['#02060a', '#0a2a33', '#127a7a'], accent: '#8affd8' }, { sky: ['#0a0210', '#2a0a40', '#7a1f6b'], accent: '#ff9cf0' }],
    drama: [{ sky: ['#2b1036', '#b5466b', '#ffb36b'], accent: '#ffd59a' }, { sky: ['#0f1b3a', '#4a5fa8', '#f2a6a0'], accent: '#ffe0c2' }, { sky: ['#1d1030', '#7a3f8f', '#f7c873'], accent: '#ffe7a8' }],
    adventure: [{ sky: ['#0c1630', '#2f4b7c', '#d58b62'], accent: '#ffd28a' }, { sky: ['#0a1f1a', '#2d6a55', '#e0b25a'], accent: '#fff0a8' }, { sky: ['#1a1030', '#5a3a7c', '#e88a6a'], accent: '#ffc8a0' }]
};
const GENRE_THEME = [
    [/สยอง|ระทึก|horror|thriller/i, 'horror'], [/แอนิเมชัน|ครอบครัว|คอมเมดี้|animation|family|comedy/i, 'toon'],
    [/ไซไฟ|sci-?fi|science/i, 'scifi'], [/แฟนตาซี|ผจญภัย|fantasy|adventure/i, 'adventure'],
    [/แอ็คชัน|แอคชั่น|อาชญากรรม|action|crime|war|สงคราม/i, 'action'], [/ดราม่า|โรแมนติก|drama|romance|ชีวประวัติ/i, 'drama']
];

function hashOf(text) {
    return [...String(text || 'movie')].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7);
}
function randomFrom(seed) {
    let state = seed || 1;
    return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}
// the first (main) genre of the movie decides the scene
function themeOf(movie) {
    for (const genre of movie?.genres || []) {
        const hit = GENRE_THEME.find(([pattern]) => pattern.test(genre));
        if (hit) return hit[1];
    }
    return ['drama', 'action', 'scifi', 'adventure'][hashOf(movie?.id) % 4];
}
const xmlText = (text) => String(text || '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const svgUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg).replace(/'/g, '%27')}`; // %27 keeps url('...') intact

// a standing person, feet at (x, y), height h
function figure(x, y, h, fill) {
    const s = h / 100;
    return `<g transform="translate(${x - 14 * s} ${y - h}) scale(${s})" fill="${fill}"><circle cx="14" cy="9" r="8"/><path d="M3 22c0-4 4-6 11-6s11 2 11 6l3 34-6 2-2-18-1 60h-7l-1-36-1 36H7L6 40l-2 18-6-2z"/></g>`;
}

function posterScene(kind, rnd) {
    const r = (a, b) => a + rnd() * (b - a);
    if (kind === 'horror') {
        const trees = [40, 455].map((x, i) => `<path d="M${x} 760 L${x + (i ? -6 : 6)} 470 ${i ? `M${x - 3} 560 l-60 -55 M${x - 4} 520 l-40 -70 M${x - 2} 600 l-80 -20` : `M${x + 3} 560 l60 -55 M${x + 4} 520 l40 -70 M${x + 2} 600 l80 -20`}" stroke="#05070d" stroke-width="9" stroke-linecap="round" fill="none"/>`).join('');
        const mist = [520, 585, 650].map((y, i) => `<ellipse cx="${r(150, 350)}" cy="${y}" rx="${r(220, 300)}" ry="${18 + i * 6}" fill="#cfd8ea" opacity="${0.08 + i * 0.03}"/>`).join('');
        return `<circle cx="${r(300, 360)}" cy="185" r="150" fill="url(#glow)"/><circle cx="330" cy="185" r="78" fill="#efeadf"/><circle cx="352" cy="170" r="14" fill="#d9d2c4"/><circle cx="312" cy="208" r="9" fill="#d9d2c4"/>
            <path d="M0 640 Q120 585 250 615 T500 600 V750 H0z" fill="#06080f"/>${trees}${figure(250, 625, 70, '#000')}${mist}
            <path d="M120 120 l14 8 14 -8 M380 300 l10 6 10 -6" stroke="#05070d" stroke-width="4" fill="none"/>`;
    }
    if (kind === 'action') {
        let skyline = '';
        for (let x = -10; x < 510;) { const w = r(30, 70); const h = r(120, 330); skyline += `<rect x="${x}" y="${640 - h}" width="${w}" height="${h + 120}" fill="#140603"/>`; x += w + r(2, 8); }
        const streaks = Array.from({ length: 9 }, () => { const x = r(-50, 500); return `<line x1="${x}" y1="${r(80, 400)}" x2="${x + 140}" y2="${r(380, 620)}" stroke="#ffcf8a" stroke-width="${r(1, 3)}" opacity="${r(0.15, 0.45)}"/>`; }).join('');
        const sparks = Array.from({ length: 26 }, () => `<circle cx="${r(80, 420)}" cy="${r(180, 520)}" r="${r(1, 3.5)}" fill="#ffd27a" opacity="${r(0.4, 1)}"/>`).join('');
        return `<circle cx="250" cy="340" r="260" fill="url(#glow)"/><circle cx="250" cy="340" r="95" fill="#ffd27a" opacity=".85"/>${streaks}${skyline}${sparks}${figure(250, 690, 150, '#090302')}`;
    }
    if (kind === 'toon') {
        const rays = Array.from({ length: 12 }, (_v, i) => `<rect x="-6" y="-170" width="12" height="70" rx="6" fill="#fff3b0" transform="translate(370 170) rotate(${i * 30})"/>`).join('');
        const cloud = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff"><circle cx="0" cy="0" r="26"/><circle cx="28" cy="-10" r="32"/><circle cx="60" cy="2" r="24"/><rect x="-10" y="0" width="80" height="24" rx="12"/></g>`;
        const sparkle = Array.from({ length: 8 }, () => `<path d="M0 -9 L2 -2 9 0 2 2 0 9 -2 2 -9 0 -2 -2z" fill="#fff" transform="translate(${r(30, 470)} ${r(60, 330)}) scale(${r(0.8, 1.6)})"/>`).join('');
        return `${rays}<circle cx="370" cy="170" r="70" fill="#ffd95a"/>${cloud(70, 160, 1.2)}${cloud(250, 250, 0.9)}${sparkle}
            <path d="M-20 560 Q120 470 260 540 T520 520 V750 H-20z" fill="#8fdc8a"/><path d="M-20 620 Q160 560 300 610 T520 600 V750 H-20z" fill="#ff9cc5"/>
            <path d="M-20 680 Q140 640 260 670 T520 660 V750 H-20z" fill="#b78cff"/>`;
    }
    if (kind === 'scifi') {
        const stars = Array.from({ length: 90 }, () => `<circle cx="${r(0, 500)}" cy="${r(0, 520)}" r="${r(0.4, 1.8)}" fill="#fff" opacity="${r(0.3, 1)}"/>`).join('');
        let grid = '';
        for (let i = 0; i <= 12; i += 1) grid += `<line x1="${250 + (i - 6) * 20}" y1="560" x2="${250 + (i - 6) * 140}" y2="760" stroke="${'#7fe7ff'}" stroke-width="1.2" opacity=".5"/>`;
        for (let j = 0; j < 7; j += 1) { const y = 560 + j * j * 4.5; grid += `<line x1="0" y1="${y}" x2="500" y2="${y}" stroke="#7fe7ff" stroke-width="1" opacity="${0.15 + j * 0.06}"/>`; }
        return `${stars}<circle cx="${r(140, 200)}" cy="250" r="120" fill="url(#glow)"/><circle cx="170" cy="250" r="88" fill="#6c4bd8"/><path d="M90 230 Q170 190 250 225" stroke="#9b80ff" stroke-width="10" fill="none" opacity=".6"/>
            <ellipse cx="170" cy="255" rx="150" ry="28" fill="none" stroke="#b9a6ff" stroke-width="7" transform="rotate(-14 170 255)"/>
            <rect x="0" y="560" width="500" height="190" fill="#05061a"/>${grid}
            <g transform="translate(360 150) rotate(28)"><path d="M0 -38 L16 22 L0 12 L-16 22z" fill="#e8f7ff"/><path d="M-8 22 L0 46 L8 22z" fill="#7fe7ff"/></g>${figure(250, 640, 85, '#020210')}`;
    }
    if (kind === 'adventure') {
        const stars = Array.from({ length: 40 }, () => `<circle cx="${r(0, 500)}" cy="${r(0, 300)}" r="${r(0.4, 1.4)}" fill="#fff" opacity="${r(0.3, 0.9)}"/>`).join('');
        return `${stars}<circle cx="120" cy="150" r="160" fill="url(#glow)"/><circle cx="120" cy="150" r="40" fill="#ffe2a8"/>
            <path d="M-20 480 L90 330 L170 420 L260 290 L360 410 L430 340 L520 450 V750 H-20z" fill="#24365d"/>
            <path d="M-20 560 L120 430 L220 520 L330 400 L440 500 L520 470 V750 H-20z" fill="#18264a"/>
            <g fill="#0c1430" transform="translate(300 330)"><rect x="0" y="40" width="70" height="80"/><rect x="-14" y="18" width="20" height="102"/><rect x="64" y="10" width="20" height="110"/><path d="M-16 18 L-4 -6 L8 18z M62 10 L74 -16 L86 10z"/><rect x="22" y="70" width="18" height="50" fill="#ffd28a" opacity=".55"/></g>
            <path d="M-20 650 L150 560 L260 620 L380 560 L520 610 V750 H-20z" fill="#0d1834"/>${figure(170, 600, 70, '#060c20')}`;
    }
    // drama / romance
    const reflections = Array.from({ length: 10 }, (_v, i) => `<rect x="${250 - (90 - i * 7)}" y="${560 + i * 16}" width="${(90 - i * 7) * 2}" height="4" rx="2" fill="#ffd59a" opacity="${0.55 - i * 0.04}"/>`).join('');
    const birds = Array.from({ length: 5 }, () => { const x = r(60, 440); const y = r(120, 300); return `<path d="M${x} ${y} q8 -8 16 0 q8 -8 16 0" stroke="#3a1530" stroke-width="3" fill="none"/>`; }).join('');
    return `<circle cx="250" cy="540" r="230" fill="url(#glow)"/><circle cx="250" cy="545" r="95" fill="#ffd59a"/><rect x="0" y="545" width="500" height="205" fill="#3a1638"/>${reflections}${birds}
        <path d="M0 545 L500 545 L500 560 Q250 548 0 560z" fill="#2a0f28"/>${figure(225, 545, 95, '#1d0a1c')}${figure(268, 545, 88, '#1d0a1c')}`;
}

function generatedPoster(movie, { wide = false } = {}) {
    const kind = themeOf(movie);
    const seed = hashOf(movie?.id || movie?.titleEng || movie?.titleThai);
    const theme = POSTER_THEMES[kind][seed % POSTER_THEMES[kind].length];
    const rnd = randomFrom(seed);
    const scene = posterScene(kind, rnd);
    const defs = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${theme.sky[0]}"/><stop offset=".6" stop-color="${theme.sky[1]}"/><stop offset="1" stop-color="${theme.sky[2]}"/></linearGradient>
        <radialGradient id="glow"><stop offset="0" stop-color="${theme.accent}" stop-opacity=".55"/><stop offset="1" stop-color="${theme.accent}" stop-opacity="0"/></radialGradient>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".85"/></linearGradient></defs>`;
    const art = `${defs}<rect width="500" height="750" fill="url(#bg)"/>${scene}`;
    if (wide) {
        // banner background: the same scene cropped to 16:9 (the page draws the title on top)
        return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="${theme.sky[0]}"/><svg viewBox="0 0 500 750" width="1600" height="900" preserveAspectRatio="xMidYMid slice">${art}</svg></svg>`);
    }
    const title = String(movie?.titleThai || movie?.titleEng || '').trim();
    const sub = movie?.titleThai && movie?.titleEng && movie.titleEng !== movie.titleThai ? movie.titleEng : '';
    let lines = [title];
    if (title.length > 14) {
        const spaces = [...title.matchAll(/\s/g)].map((m) => m.index);
        const cut = spaces.sort((a, b) => Math.abs(a - title.length / 2) - Math.abs(b - title.length / 2))[0];
        if (cut) lines = [title.slice(0, cut), title.slice(cut + 1)];
    }
    const size = Math.max(32, Math.min(58, 640 / Math.max(...lines.map((l) => l.length), 8)));
    const baseY = 640 - (lines.length - 1) * size * 1.12 - (sub ? 30 : 0);
    const titleSvg = lines.map((line, i) => `<text x="250" y="${baseY + i * size * 1.12}" text-anchor="middle" font-size="${size}" font-weight="800" fill="#fff" letter-spacing="-0.5">${xmlText(line)}</text>`).join('');
    const subSvg = sub ? `<text x="250" y="${baseY + (lines.length - 1) * size * 1.12 + 38}" text-anchor="middle" font-size="21" font-weight="600" fill="#ffffffcc" letter-spacing="2">${xmlText(sub.toUpperCase())}</text>` : '';
    const footer = `<text x="250" y="728" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff99" letter-spacing="4">IN CINEMAS</text>`;
    return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750" font-family="Inter, 'Noto Sans Thai', Thonburi, Tahoma, sans-serif">${art}<rect y="430" width="500" height="320" fill="url(#fade)"/>${titleSvg}${subSvg}${footer}</svg>`);
}

// Cast member without a photo: a neutral silhouette (no face) on a colour picked from the name.
function castAvatar(actor) {
    const palettes = [['#fbdbe8', '#e9508c'], ['#dbe7fb', '#4f86f7'], ['#fbe6d6', '#f08a3e'], ['#d6f3ea', '#1f9e74'], ['#e8defb', '#8b63e6'], ['#fbe0e6', '#d43b78']];
    const [bg, fg] = palettes[hashOf(actor?.name) % palettes.length];
    return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${bg}"/></linearGradient></defs><rect width="200" height="200" fill="url(#a)"/><circle cx="100" cy="82" r="38" fill="${fg}" opacity=".85"/><path d="M30 200c0-46 31-72 70-72s70 26 70 72z" fill="${fg}" opacity=".85"/></svg>`);
}

function posterFor(movie) {
    if (!movie) return generatedPoster({});
    return usableImage(movie.posterImage) || usableImage(movie.backdropImage) || usableImage(movie.trailerImage) || generatedPoster(movie);
}

async function getRealMoviePoster(movie) {
    if (!movie?.id) {
        return null;
    }
    return posterFor(movie);
}

// Forget posters cached by the old Wikipedia lookup.
try {
    Object.keys(localStorage).filter((key) => key.startsWith('cinema.poster.')).forEach((key) => localStorage.removeItem(key));
} catch (_error) {
}

window.cinemaMovieImages = {
    getRealMoviePoster,
    posterFor,
    generatedPoster,
    castAvatar,
    usableImage
};
