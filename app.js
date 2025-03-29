//Invocamos a Express
const express = require('express');
const app = express();
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const { create } = require('xmlbuilder2');


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


//Vista de facturas
app.get('/facturas', (req, res) => {
    connection.query('SELECT * FROM mi_v_facturas', (err, rows) => {
        if (err) {
            console.error("Error en la consulta:", err);
            return res.status(500).send("Error en la consulta a la base de datos: " + err.message);
        }
        res.render('facturas', { facturas: rows });
    });
});

const os = require('os'); // Importamos el módulo OS para obtener la ruta del usuario
const fs = require('fs');
const path = require('path');

app.post('/facturar/:orderId', async (req, res) => {
    const orderId = req.params.orderId;

    try {
        // Obtener datos de la factura desde la base de datos
        const [rows] = await connection.promise().query('SELECT * FROM mi_v_facturas WHERE order_id = ?', [orderId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Orden no encontrada." });
        }

        const factura = rows[0];
        const fecha = new Date(factura.order_date).toISOString().split('T')[0]; // Fecha en formato YYYY-MM-DD

        // Calcular el IVA (puedes ajustar el cálculo si es necesario)
        const iva = (factura.total_amount * 0.12).toFixed(2); // Suponiendo que el IVA es del 12%

        // Generar XML con xmlbuilder2
        const xml = create({ version: '1.0', encoding: 'utf-8' })
            .ele('soap:Envelope', { 'xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/' })
            .ele('soap:Header')
                .ele('Requestor').txt('0AB55B4F-7903-4337-874F-7CE69A9DD72A').up()
                .ele('Authentication')
                    .ele('Usuario').txt('alexis').up()
                    .ele('Contrasena').txt('OxdeaS.A.').up()
                .up()
            .up()
            .ele('soap:Body')
                .ele('dte:GTDocumento', {
                    'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
                    'xmlns:dte': 'http://www.sat.gob.gt/dte/fel/0.2.0',
                    'Version': '0.1'
                })
                .ele('dte:SAT', { ClaseDocumento: 'dte' })
                    .ele('dte:DTE', { ID: 'DatosCertificados' })
                        .ele('dte:DatosEmision', { ID: 'DatosEmision' })
                            .ele('dte:DatosGenerales', { CodigoMoneda: 'GTQ', FechaHoraEmision: new Date().toISOString(), Tipo: 'FACT' }).up()
                            .ele('dte:Emisor', { AfiliacionIVA: 'GEN', CodigoEstablecimiento: '1', NITEmisor: '120412772', NombreComercial: 'OxdeaS.A.', NombreEmisor: factura.customer_name || 'OxdeaS.A.' })
                                .ele('dte:DireccionEmisor')
                                    .ele('dte:Direccion').txt('Ciudad').up()
                                    .ele('dte:CodigoPostal').txt('01000').up()
                                    .ele('dte:Municipio').txt('Coban').up()
                                    .ele('dte:Departamento').txt('Alta Verapaz').up()
                                    .ele('dte:Pais').txt('GT').up()
                                .up()
                            .up()
                            .ele('dte:Receptor', { IDReceptor: factura.custom_billing_field || 'CF', NombreReceptor: factura.customer_name || 'CF' })
                                .ele('dte:DireccionReceptor')
                                    .ele('dte:Direccion').txt('correoagmail.com').up()
                                    .ele('dte:CodigoPostal').txt('01000').up()
                                    .ele('dte:Municipio').txt('.').up()
                                    .ele('dte:Departamento').txt('.').up()
                                    .ele('dte:Pais').txt('GT').up()
                                .up()
                            .up()
                            .ele('dte:Items')
                                .ele('dte:Item', { BienOServicio: 'B', NumeroLinea: '1' })
                                    .ele('dte:Cantidad').txt('1.0000000').up()
                                    .ele('dte:UnidadMedida').txt('UNI').up()
                                    .ele('dte:Descripcion').txt(factura.description || 'Producto sin descripción').up()
                                    .ele('dte:PrecioUnitario').txt(factura.total_amount).up()
                                    .ele('dte:Precio').txt(factura.total_amount).up()
                                    .ele('dte:Total').txt(factura.total_amount).up()
                                .up()
                            .up()
                            .ele('dte:Totales')
                                .ele('dte:TotalImpuestos')
                                    .ele('dte:TotalImpuesto', { NombreCorto: 'IVA', TotalMontoImpuesto: iva }).up()
                                .up()
                                .ele('dte:GranTotal').txt(factura.total_amount).up()
                            .up()
                        .up()
                    .up()
                .up()
            .end({ prettyPrint: true });

        // Guardar XML como .xml en el escritorio
        const escritorioPath = path.join(os.homedir(), 'Desktop');
        const filePath = path.join(escritorioPath, `factura_${orderId}_${fecha}.txt`);

        // Guardamos el archivo .xml
        fs.writeFileSync(filePath, xml);

        // Simulamos la llamada a la SAT (sin conexión real)
        // Deja un comentario o muestra un mensaje como prueba
        console.log("Factura generada en:", filePath);

        // Respondemos al cliente que la factura ha sido generada y guardada
        return res.json({ success: true, filePath });

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "Ocurrió un error al generar la factura." });
    }
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