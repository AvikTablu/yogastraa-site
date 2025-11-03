const formMd = document.getElementById('contactFormMd');
const buttonMd = formMd.querySelector('button[type="submit"]');
const messageDivMd = document.getElementById('messageMd');

formMd.addEventListener('input', () => {
    const inputs = formMd.querySelectorAll('input, textarea');
    let allFilled = true;

    inputs.forEach(input => {
        if (!input.value.trim()) {
            allFilled = false;
        }
    });

    buttonMd.disabled = !allFilled;
});

formMd.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = document.getElementById('nameMd').value;
    const email = document.getElementById('emailMd').value;
    const message = document.getElementById('messageMd').value;

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
            messageDivMd.textContent = 'Message sent successfully!';
            formMd.reset();
        } else {
            messageDivMd.textContent = 'Error sending message. Please try again later.';
        }
    } catch (error) {
        console.error('Error:', error);
        messageDivMd.textContent = 'An error occurred. Please try again later.';
    }
});