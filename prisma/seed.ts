import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

console.log('Connecting to:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'))

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  // Create Super Admin (no pharmacy)
  const superAdminPassword = await bcrypt.hash('admin123', 12)
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@neuropharm.io' },
    update: {},
    create: {
      email: 'superadmin@neuropharm.io',
      password: superAdminPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      phone: '+221770000000',
    },
  })
  console.log('Super Admin created:', superAdmin.email)

  // Create demo pharmacy
  const pharmacy = await prisma.pharmacy.upsert({
    where: { id: 'demo-pharmacy' },
    update: {},
    create: {
      id: 'demo-pharmacy',
      name: 'Pharmacie du Plateau',
      address: '12 Avenue Leopold Sedar Senghor',
      city: 'Dakar',
      country: 'Senegal',
      phone: '+221338230100',
      email: 'contact@pharmacie-plateau.sn',
      currency: 'XOF',
    },
  })

  // Create subscription
  await prisma.subscription.upsert({
    where: { pharmacyId: pharmacy.id },
    update: {},
    create: {
      pharmacyId: pharmacy.id,
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      amount: 35000,
    },
  })

  // Create pharmacy settings
  await prisma.pharmacySettings.upsert({
    where: { pharmacyId: pharmacy.id },
    update: {},
    create: {
      pharmacyId: pharmacy.id,
      taxRate: 0,
      lowStockThreshold: 10,
      expiryAlertDays: 30,
      receiptHeader: 'Pharmacie du Plateau\n12 Ave L.S. Senghor, Dakar',
      receiptFooter: 'Merci pour votre confiance!',
    },
  })

  // Create users
  const adminPassword = await bcrypt.hash('admin123', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@pharmacie-plateau.sn' },
    update: {},
    create: {
      email: 'admin@pharmacie-plateau.sn',
      password: adminPassword,
      firstName: 'Amadou',
      lastName: 'Diallo',
      phone: '+221771234567',
      role: 'ADMIN',
      pharmacyId: pharmacy.id,
    },
  })

  const pharmacist = await prisma.user.upsert({
    where: { email: 'pharmacien@pharmacie-plateau.sn' },
    update: {},
    create: {
      email: 'pharmacien@pharmacie-plateau.sn',
      password: adminPassword,
      firstName: 'Fatou',
      lastName: 'Sow',
      phone: '+221772345678',
      role: 'PHARMACIST',
      pharmacyId: pharmacy.id,
    },
  })

  const cashier = await prisma.user.upsert({
    where: { email: 'caissier@pharmacie-plateau.sn' },
    update: {},
    create: {
      email: 'caissier@pharmacie-plateau.sn',
      password: adminPassword,
      firstName: 'Moussa',
      lastName: 'Ndiaye',
      phone: '+221773456789',
      role: 'CASHIER',
      pharmacyId: pharmacy.id,
    },
  })

  console.log('Users created:', admin.email, pharmacist.email, cashier.email)

  // Create categories
  const categories = await Promise.all([
    prisma.category.upsert({ where: { name_pharmacyId: { name: 'Analgesiques', pharmacyId: pharmacy.id } }, update: {}, create: { name: 'Analgesiques', description: 'Anti-douleur', pharmacyId: pharmacy.id } }),
    prisma.category.upsert({ where: { name_pharmacyId: { name: 'Antibiotiques', pharmacyId: pharmacy.id } }, update: {}, create: { name: 'Antibiotiques', description: 'Contre les infections', pharmacyId: pharmacy.id } }),
    prisma.category.upsert({ where: { name_pharmacyId: { name: 'Antipaludeens', pharmacyId: pharmacy.id } }, update: {}, create: { name: 'Antipaludeens', description: 'Contre le paludisme', pharmacyId: pharmacy.id } }),
    prisma.category.upsert({ where: { name_pharmacyId: { name: 'Vitamines', pharmacyId: pharmacy.id } }, update: {}, create: { name: 'Vitamines', description: 'Complements vitaminiques', pharmacyId: pharmacy.id } }),
    prisma.category.upsert({ where: { name_pharmacyId: { name: 'Dermatologie', pharmacyId: pharmacy.id } }, update: {}, create: { name: 'Dermatologie', description: 'Soins de la peau', pharmacyId: pharmacy.id } }),
    prisma.category.upsert({ where: { name_pharmacyId: { name: 'Gastro', pharmacyId: pharmacy.id } }, update: {}, create: { name: 'Gastro', description: 'Systeme digestif', pharmacyId: pharmacy.id } }),
  ])
  console.log('Categories created:', categories.length)

  // Create medications
  const meds = [
    { name: 'Paracetamol 500mg', genericName: 'Acetaminophene', barcode: '3400930000001', form: 'comprime', categoryIdx: 0, purchasePrice: 800, sellingPrice: 1200, quantity: 250, minStock: 50, expiryDate: new Date('2027-06-30') },
    { name: 'Amoxicilline 500mg', genericName: 'Amoxicillin', barcode: '3400930000002', form: 'gelule', categoryIdx: 1, purchasePrice: 2500, sellingPrice: 3500, quantity: 120, minStock: 30, expiryDate: new Date('2026-12-31') },
    { name: 'Artemether-Lumefantrine', genericName: 'Coartem', barcode: '3400930000003', form: 'comprime', categoryIdx: 2, purchasePrice: 3000, sellingPrice: 4500, quantity: 80, minStock: 20, expiryDate: new Date('2026-09-30'), requiresPrescription: true },
    { name: 'Ibuprofene 400mg', genericName: 'Ibuprofen', barcode: '3400930000004', form: 'comprime', categoryIdx: 0, purchasePrice: 1000, sellingPrice: 1500, quantity: 180, minStock: 40, expiryDate: new Date('2027-03-31') },
    { name: 'Vitamine C 1000mg', genericName: 'Acide ascorbique', barcode: '3400930000005', form: 'comprime', categoryIdx: 3, purchasePrice: 1500, sellingPrice: 2500, quantity: 200, minStock: 30, expiryDate: new Date('2027-12-31') },
    { name: 'Metronidazole 250mg', genericName: 'Flagyl', barcode: '3400930000006', form: 'comprime', categoryIdx: 1, purchasePrice: 1200, sellingPrice: 1800, quantity: 90, minStock: 20, expiryDate: new Date('2026-08-31'), requiresPrescription: true },
    { name: 'Omeprazole 20mg', genericName: 'Omeprazole', barcode: '3400930000007', form: 'gelule', categoryIdx: 5, purchasePrice: 2000, sellingPrice: 3000, quantity: 5, minStock: 15, expiryDate: new Date('2026-11-30') },
    { name: 'Creme Hydrocortisone 1%', genericName: 'Hydrocortisone', barcode: '3400930000008', form: 'creme', categoryIdx: 4, purchasePrice: 2500, sellingPrice: 4000, quantity: 40, minStock: 10, expiryDate: new Date('2025-04-15') },
    { name: 'Doliprane 1000mg', genericName: 'Paracetamol', barcode: '3400930000009', form: 'comprime', categoryIdx: 0, purchasePrice: 1200, sellingPrice: 2000, quantity: 300, minStock: 50, expiryDate: new Date('2027-09-30') },
    { name: 'Chloroquine 100mg', genericName: 'Chloroquine', barcode: '3400930000010', form: 'comprime', categoryIdx: 2, purchasePrice: 800, sellingPrice: 1200, quantity: 0, minStock: 20, expiryDate: new Date('2026-06-30') },
  ]

  for (const med of meds) {
    await prisma.medication.create({
      data: {
        name: med.name, genericName: med.genericName, barcode: med.barcode,
        form: med.form, categoryId: categories[med.categoryIdx].id,
        pharmacyId: pharmacy.id, purchasePrice: med.purchasePrice,
        sellingPrice: med.sellingPrice, quantity: med.quantity,
        minStock: med.minStock, expiryDate: med.expiryDate,
        requiresPrescription: med.requiresPrescription || false,
      },
    })
  }
  console.log('Medications created:', meds.length)

  // Create suppliers
  await prisma.supplier.createMany({
    data: [
      { name: 'Laborex Senegal', contact: 'M. Ba', phone: '+221338200100', email: 'commandes@laborex.sn', address: 'Zone industrielle, Dakar', pharmacyId: pharmacy.id },
      { name: 'COPHASE', contact: 'Mme Diop', phone: '+221338201200', email: 'info@cophase.sn', address: 'Route de Rufisque, Dakar', pharmacyId: pharmacy.id },
      { name: 'Sogen Pharma', contact: 'M. Fall', phone: '+221338202300', email: 'supply@sogen.sn', address: 'Pikine, Dakar', pharmacyId: pharmacy.id },
    ],
    skipDuplicates: true,
  })
  console.log('Suppliers created')

  // Create sample sales
  const medications = await prisma.medication.findMany({ where: { pharmacyId: pharmacy.id } })
  for (let i = 0; i < 15; i++) {
    const med1 = medications[Math.floor(Math.random() * medications.length)]
    const med2 = medications[Math.floor(Math.random() * medications.length)]
    const qty1 = Math.floor(Math.random() * 3) + 1
    const qty2 = Math.floor(Math.random() * 2) + 1
    const items = [
      { medicationId: med1.id, quantity: qty1, unitPrice: med1.sellingPrice, total: qty1 * med1.sellingPrice },
      ...(med2.id !== med1.id ? [{ medicationId: med2.id, quantity: qty2, unitPrice: med2.sellingPrice, total: qty2 * med2.sellingPrice }] : []),
    ]
    const subtotal = items.reduce((s, it) => s + it.total, 0)
    const daysAgo = Math.floor(Math.random() * 30)
    const date = new Date()
    date.setDate(date.getDate() - daysAgo)

    await prisma.sale.create({
      data: {
        pharmacyId: pharmacy.id,
        userId: [admin.id, pharmacist.id, cashier.id][Math.floor(Math.random() * 3)],
        subtotal, tax: 0, discount: 0, total: subtotal,
        paymentMethod: ['CASH', 'MOBILE_MONEY', 'CARD'][Math.floor(Math.random() * 3)] as 'CASH' | 'MOBILE_MONEY' | 'CARD',
        createdAt: date,
        items: { create: items },
      },
    })
  }
  console.log('Sample sales created')

  // Create sample expenses
  const expCategories = ['loyer', 'services', 'salaires', 'fournitures', 'transport']
  for (let i = 0; i < 10; i++) {
    const daysAgo = Math.floor(Math.random() * 60)
    const date = new Date()
    date.setDate(date.getDate() - daysAgo)
    await prisma.expense.create({
      data: {
        pharmacyId: pharmacy.id,
        category: expCategories[Math.floor(Math.random() * expCategories.length)],
        description: 'Depense courante',
        amount: Math.floor(Math.random() * 200000) + 10000,
        date,
      },
    })
  }
  console.log('Sample expenses created')

  // Create notifications
  await prisma.notification.createMany({
    data: [
      { pharmacyId: pharmacy.id, title: 'Stock bas', message: 'Omeprazole 20mg est en dessous du seuil minimal', type: 'stock_low', severity: 'warning' },
      { pharmacyId: pharmacy.id, title: 'Expiration proche', message: 'Creme Hydrocortisone 1% expire dans 10 jours', type: 'expiry', severity: 'critical' },
      { pharmacyId: pharmacy.id, title: 'Rupture de stock', message: 'Chloroquine 100mg est en rupture de stock', type: 'stock_low', severity: 'critical' },
      { pharmacyId: pharmacy.id, title: 'Bienvenue', message: 'Bienvenue sur NeuroPharm! Explorez les fonctionnalites.', type: 'system', severity: 'info', isRead: true },
    ],
  })
  console.log('Notifications created')

  console.log('\n✅ Seed completed successfully!')
  console.log('\n📧 Demo accounts:')
  console.log('   Super Admin: superadmin@neuropharm.io / admin123')
  console.log('   Admin:       admin@pharmacie-plateau.sn / admin123')
  console.log('   Pharmacien:  pharmacien@pharmacie-plateau.sn / admin123')
  console.log('   Caissier:    caissier@pharmacie-plateau.sn / admin123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
