//Invocamos a Express
const express = require('express');
const app = express();


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
                
                res.render('login', {
                    alert: true,
                    alertTitle: "Conexión exitosa",
                    alertMessage: "¡LOGIN CORRECTO!",
                    alertIcon: 'success',
                    showConfirmButton: false,
                    timer: 1500,
                    ruta: ''
                });
            }
            res.end();
        });
    } else {
        res.send('Por favor ingrese usuario y contraseña');
        res.end();
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



app.listen(3000, (req, res) => {
    console.log('SERVER RUNNING IN http://localhost:3000');
});