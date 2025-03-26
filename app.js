//Invocamos a Express
const express = require('express');
const app = express();
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');


//Para poder capturar los datos del formulario (sin urlencoded nos devuelve "undefined")
app.use(express.urlencoded({ extended: false }));
app.use(express.json());//además le decimos a express que vamos a usar json

//Invocamos a dotenv
const dotenv = require('dotenv');
dotenv.config({ path: './env/.env' });

//seteamos el directorio de assets
app.use('/resources', express.static('public'));
app.use('/resources', express.static(__dirname + '/public'));

//Establecemos el motor de plantillas
app.set('view engine', 'ejs');

//Invocamos a bcrypt
const bcrypt = require('bcryptjs');

//variables de session
const session = require('express-session');
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));

//Invocamos a la conexion de la DB
const connection = require('./database/db');

//9 - establecemos las rutas
app.get('/login', (req, res) => {
    res.render('login');
})

app.get('/register', (req, res) => {
    res.render('register');
})

//metodo para la REGISTRACIÓN
app.post('/register', async (req, res) => {
    const user = req.body.user;
    const name = req.body.name;
    const pass = req.body.pass;
    const rol = req.body.rol;  // Recibimos el valor del rol
    
    let passwordHash = await bcrypt.hash(pass, 8);

    // Convertimos el rol a 1 o 2
    const idRol = (rol === 'admin') ? 1 : 2;
    
    connection.query('INSERT INTO tab_usuario SET ?', {
        nombre: name,
        clave: passwordHash,
        email: user,
        idRol: idRol, 
        restablecer: 0,
        confirmado: 1,
        token: 'u5uar10sT35t'
    }, (error, results) => {
        if (error) {
            console.error('Error al registrar usuario:', error);
            res.status(500).send('Error en el servidor');
        } else {
            res.render('register', {
                alert: true,
                alertTitle: "Registro",
                alertMessage: "¡Registro exitoso!",
                alertIcon: 'success',
                showConfirmButton: false,
                timer: 1500,
                ruta: ''
            });
        }
    });
});

// Middleware to check authentication for all routes except login and register
app.use((req, res, next) => {
    // List of public routes that don't require authentication
    const publicRoutes = ['/login', '/register', '/auth'];

    // Check if the requested route is public
    if (publicRoutes.includes(req.path)) {
        return next();
    }

    // Check if user is logged in
    if (req.session.loggedin) {
        next();
    } else {
        // Redirect to login page for any protected route
        res.redirect('/login');
    }
});

//metodo para la autenticacion
app.post('/auth', async (req, res) => {
    const user = req.body.user;
    const pass = req.body.pass;
    
    if (user && pass) {
        connection.query('SELECT * FROM tab_usuario WHERE email = ? OR nombre = ?', [user, user], async (error, results) => {
            if (error) {
                console.error('Error en la consulta:', error);
                res.status(500).send('Error en el servidor');
                return;
            }
            
            if (results.length == 0 || !(await bcrypt.compare(pass, results[0].clave))) {
                res.render('login', {
                    alert: true,
                    alertTitle: "Error",
                    alertMessage: "Usuario o contraseña incorrectos",
                    alertIcon: 'error',
                    showConfirmButton: true,
                    timer: false,
                    ruta: 'login'
                });
            } else {
                // Crear sesión
                req.session.loggedin = true;
                req.session.name = results[0].nombre;
                // Aquí puedes agregar el rol del usuario si lo necesitas
                req.session.rol = results[0].idRol;
                
                // Redirigir al index después del login exitoso
                res.redirect('/');
            }
        });
    } else {
        res.send('Por favor ingrese usuario y contraseña');
    }
});

//metodo para controlar que esta auth en todas las páginas
app.get('/', (req, res) => {
    if (req.session.loggedin) {
        res.render('index', {
            login: true,
            name: req.session.name
        });
    } else {
        // Redirect to login page instead of rendering index
        res.redirect('/login');
    }
});

//función para limpiar la caché luego del logout
app.use(function (req, res, next) {
    if (!req.user)
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    next();
});

//Logout
//Destruye la sesion
app.get('/logout', function (req, res) {
    req.session.destroy(() => {
        res.redirect('/') // siempre se ejecutará después de que se destruya la sesión
    })
});

app.get('/facturas', (req, res) => {
    connection.query('SELECT * FROM mi_v_facturas', (err, rows) => {
        if (err) {
            console.error("Error en la consulta:", err);
            return res.status(500).send("Error en la consulta a la base de datos: " + err.message);
        }
        res.render('facturas', { facturas: rows });
    });
});

// Ruta para consultar NIT
app.get('/nit', (req, res) => {
    if (req.session.loggedin) {
        res.render('nit', {
            login: true,
            name: req.session.name
        });
    } else {
        res.redirect('/login');
    }
});

app.post('/nit', async (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/login');
    }

    try {
        const { nit } = req.body;

        const soapRequest = 
        `<?xml version="1.0" encoding="utf-8"?>
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
                xmlns:xsd="http://www.w3.org/2001/XMLSchema">
                <soap:Body>
                    <getNIT xmlns="http://tempuri.org/">
                        <vNIT>${nit}</vNIT>
                        <Entity>800000001026</Entity>
                        <Requestor>94E0301E-AD36-4BAC-B327-BA1C0638469E</Requestor>
                    </getNIT>
                </soap:Body>
            </soap:Envelope>`;

        const response = await axios.post(
            'https://app.corposistemasgt.com/getnit/ConsultaNIT.asmx',
            soapRequest,
            {
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': 'http://tempuri.org/getNIT'
                }
            }
        );

        // Convertir XML a JSON
        const parser = new XMLParser();
        const jsonResponse = parser.parse(response.data);
        
        res.render('nit', {
            login: true,
            name: req.session.name,
            resultado: jsonResponse,
            nit: nit
        });

    } catch (error) {
        console.error('Error en el servidor:', error);
        res.render('nit', {
            login: true,
            name: req.session.name,
            error: 'Error al consultar el NIT',
            nit: nit
        });
    }
});


app.listen(3000, (req, res) => {
    console.log('SERVER RUNNING IN http://localhost:3000');
});