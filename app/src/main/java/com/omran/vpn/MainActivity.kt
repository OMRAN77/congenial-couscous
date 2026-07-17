package com.omran.vpn

import android.net.VpnService
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class OmranTunnel(private val tunnelName: String) : Tunnel {
    override fun getName(): String = tunnelName
    override fun onStateChange(newState: Tunnel.State) {}
}

class MainActivity : AppCompatActivity() {

    private lateinit var backend: GoBackend
    private val fraTunnel = OmranTunnel("fra")
    private val sgpTunnel = OmranTunnel("sgp")
    private var activeTunnel: OmranTunnel? = null
    private var pendingConnect: (() -> Unit)? = null

    private lateinit var tvStatus: TextView
    private lateinit var btnFrankfurt: Button
    private lateinit var btnSingapore: Button
    private lateinit var btnDisconnect: Button
    private lateinit var progressBar: ProgressBar

    private val vpnPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            pendingConnect?.invoke()
        } else {
            setStatus("تم رفض إذن الـ VPN")
        }
        pendingConnect = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        backend = GoBackend(applicationContext)

        tvStatus = findViewById(R.id.tvStatus)
        btnFrankfurt = findViewById(R.id.btnFrankfurt)
        btnSingapore = findViewById(R.id.btnSingapore)
        btnLosAngeles = findViewById(R.id.btnLosAngeles)
        btnWarsaw = findViewById(R.id.btnWarsaw)
        btnDisconnect = findViewById(R.id.btnDisconnect)
        progressBar = findViewById(R.id.progressBar)

        btnFrankfurt.setOnClickListener { connectTo(fraTunnel, R.raw.frankfurt, "🇩🇪 فرانكفورت") }
        btnSingapore.setOnClickListener { connectTo(sgpTunnel, R.raw.singapore, "🇸🇬 سنغافورة") }
        btnLosAngeles.setOnClickListener { connectTo(laxTunnel, R.raw.losangeles, "🇺🇸 لوس أنجلوس") }
        btnWarsaw.setOnClickListener { connectTo(wawTunnel, R.raw.warsaw, "🇵🇱 وارسو") }
        btnDisconnect.setOnClickListener { disconnect() }
    }

    private fun connectTo(tunnel: OmranTunnel, confRes: Int, label: String) {
        val intent = VpnService.prepare(this)
        if (intent != null) {
            pendingConnect = { doConnect(tunnel, confRes, label) }
            vpnPermissionLauncher.launch(intent)
        } else {
            doConnect(tunnel, confRes, label)
        }
    }

    private fun doConnect(tunnel: OmranTunnel, confRes: Int, label: String) {
        setLoading(true)
        setStatus("جاري الاتصال بـ $label ...")
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // Disconnect any other active tunnel first
                activeTunnel?.let {
                    if (it.name != tunnel.name) {
                        backend.setState(it, Tunnel.State.DOWN, null)
                    }
                }
                val config = resources.openRawResource(confRes).use { stream ->
                    Config.parse(stream)
                }
                backend.setState(tunnel, Tunnel.State.UP, config)
                activeTunnel = tunnel
                withContext(Dispatchers.Main) {
                    setLoading(false)
                    setStatus("متصل ✅ - $label")
                    btnDisconnect.visibility = View.VISIBLE
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    setLoading(false)
                    setStatus("فشل الاتصال: ${e.message}")
                }
            }
        }
    }

    private fun disconnect() {
        val tunnel = activeTunnel ?: return
        setLoading(true)
        CoroutineScope(Dispatchers.IO).launch {
            try {
                backend.setState(tunnel, Tunnel.State.DOWN, null)
                activeTunnel = null
                withContext(Dispatchers.Main) {
                    setLoading(false)
                    setStatus("غير متصل")
                    btnDisconnect.visibility = View.GONE
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    setLoading(false)
                    setStatus("خطأ: ${e.message}")
                }
            }
        }
    }

    private fun setStatus(text: String) {
        tvStatus.text = text
    }

    private fun setLoading(loading: Boolean) {
        progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        btnFrankfurt.isEnabled = !loading
        btnSingapore.isEnabled = !loading
        btnDisconnect.isEnabled = !loading
    }
}
