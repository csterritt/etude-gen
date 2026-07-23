/**
 * Test better-auth sign-up with email verification
 */

async function testAuthSignUp() {
  try {
    console.log('🧪 Testing better-auth sign-up with email verification...')

    // Start SMTP-tester server
    const smtpTester = await import('smtp-tester')
    const mailServer = smtpTester.default.init(2500)
    console.log('📧 SMTP test server started on port 2500')

    // Wait a moment for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const testEmail = 'authtest@example.com'

    // Set up email capture
    const emailPromise = mailServer.captureOne(testEmail, { wait: 10000 })

    // Make sign-up request to better-auth
    console.log('🔔 Making sign-up request to better-auth...')
    const response = await fetch('http://localhost:3000/api/auth/sign-up', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: testEmail,
        password: 'password123',
        name: 'Auth Test User',
      }),
    })

    console.log('📋 Response status:', response.status)
    console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()))

    const responseText = await response.text()
    console.log('📋 Response body:', responseText)

    try {
      const responseData = JSON.parse(responseText)
      console.log('📋 Parsed response:', responseData)
    } catch (e) {
      console.log('📋 Response is not JSON')
    }

    // Wait for email
    console.log('⏳ Waiting for email...')
    try {
      const { email } = await emailPromise
      console.log('✅ Email received!')
      console.log('📋 Subject:', email.subject)
      console.log('📋 To:', email.to)
      console.log('📋 Content preview:', email.text?.substring(0, 200) + '...')
    } catch (emailError) {
      console.log('❌ No email received:', emailError.message)
    }

    // Stop server
    if (mailServer && typeof mailServer.stop === 'function') {
      mailServer.stop()
    }

    console.log('🎉 Auth sign-up test completed!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Auth sign-up test failed:', error)
    process.exit(1)
  }
}

testAuthSignUp()
