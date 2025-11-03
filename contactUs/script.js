const form = document.getElementById('contactForm');
const button = form.querySelector('button[type="submit"]');
const messageDiv = document.getElementById('message');

form.addEventListener('input', () => {
    const inputs = form.querySelectorAll('input, textarea');
    let allFilled = true;

    inputs.forEach(input => {
        if (!input.value.trim()) {
            allFilled = false;
        }
    });

    button.disabled = !allFilled;
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const message = document.getElementById('message').value;

    const data = {
        name: name,
        email: email,
        message: message
    };

    try {
        const response = await fetch('https://yogastra-backend-2d084cc0cf9e.herokuapp.com/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            messageDiv.textContent = 'Message sent successfully!';
            form.reset();
        } else {
            messageDiv.textContent = 'Error sending message. Please try again later.';
        }
    } catch (error) {
        console.error('Error:', error);
        messageDiv.textContent = 'An error occurred. Please try again later.';
    }
});